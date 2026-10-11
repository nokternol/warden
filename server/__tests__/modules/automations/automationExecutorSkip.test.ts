/**
 * An automation that can no longer run is skipped, not run: the run is recorded as
 * `skipped` with the reason, and nothing reaches the actuator.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, automationRunItems, automationRuns } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import logger from '@server/kernel/logger';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import type { Filter } from '@server/modules/media/ruleRegistry';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadarrMovie } from '../../../../tests/factories';
import { server } from '../../../../tests/mocks/server';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

const RADARR_URL = 'http://localhost:7878';

describe('AutomationExecutor — invalid automations', () => {
  let automationService: AutomationService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;
  let executor: AutomationExecutor;
  let unmonitorCalls: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    automationService = new AutomationService({ db });
    providerSettingsService = new ProviderSettingsService({ db });
    mediaQueryService = new MediaQueryService({ db });
    executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
    });
    unmonitorCalls = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'The Matrix', tags: [1] })])
      ),
      http.put(`${RADARR_URL}/api/v3/movie/:id`, () => {
        unmonitorCalls += 1;
        return HttpResponse.json({ id: 1, monitored: false });
      })
    );
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  function seedRadarr(name: string, isActive = true) {
    return providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name,
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-key',
      isActive,
      settings: { enabledTasks: ['unmonitorMovie'] },
    });
  }

  async function seedAutomationOver(providerId: number, filters: Filter[]) {
    const query = await mediaQueryService.create({ name: 'Q', contentType: 'movie', filters });
    return automationService.create({
      name: 'Nightly',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });
  }

  const tagsOf = (providerId: number): Filter => ({
    ruleKey: 'tagIds',
    value: { providerId, ids: [1] },
  });

  it('skips an automation whose filter names a deleted instance, recording why and never calling the actuator', async () => {
    const own = await seedRadarr('Own Radarr');
    const removed = await seedRadarr('Removed Radarr');
    const automation = await seedAutomationOver(own.id, [tagsOf(removed.id)]);
    await providerSettingsService.delete(removed.id);

    await executor.execute(automation.id);

    const runs = await getDb().select().from(automationRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('skipped');
    expect(runs[0].error).toBe(
      `Tags filter names Radarr instance ${removed.id}, which is not an active provider`
    );
    expect(unmonitorCalls).toBe(0);
  });

  it('leaves the automation last-run summary and the run items untouched', async () => {
    const own = await seedRadarr('Own Radarr');
    const removed = await seedRadarr('Removed Radarr');
    const automation = await seedAutomationOver(own.id, [tagsOf(removed.id)]);
    await providerSettingsService.delete(removed.id);

    await executor.execute(automation.id);

    const [reloaded] = (await automationService.list()).filter((a) => a.id === automation.id);
    expect(reloaded.lastRun).toBeUndefined();
    expect(await getDb().select().from(automationRunItems)).toHaveLength(0);
  });

  it('logs the skip and its reason at warn level', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const own = await seedRadarr('Own Radarr');
    const removed = await seedRadarr('Removed Radarr');
    const automation = await seedAutomationOver(own.id, [tagsOf(removed.id)]);
    await providerSettingsService.delete(removed.id);

    await executor.execute(automation.id);

    expect(warn).toHaveBeenCalledWith(
      'Automation skipped as invalid',
      expect.objectContaining({
        automationId: automation.id,
        reason: `Tags filter names Radarr instance ${removed.id}, which is not an active provider`,
      })
    );
  });

  it("skips an automation whose filter names an instance other than the automation's own", async () => {
    const own = await seedRadarr('Own Radarr');
    const other = await seedRadarr('Other Radarr');
    const automation = await seedAutomationOver(own.id, [tagsOf(other.id)]);

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.status).toBe('skipped');
    expect(run.error).toBe(
      `Tags filter names Radarr instance ${other.id}, which is not this automation's provider (Radarr instance ${own.id})`
    );
    expect(unmonitorCalls).toBe(0);
  });
});
