/**
 * A filter whose field holds no value blocks an automation's schedule until a user signs it off,
 * and asks before a Run Now. Each scheduled skip is recorded once; each Run Now records its own.
 *
 * Run: vitest run --project server
 */
import {
  MetadataProviderType,
  automationBlocks,
  automationRuns,
  automations,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { AutomationBlockService } from '@server/modules/automations/automationBlockService';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('an automation whose filter has no data', () => {
  let executor: AutomationExecutor;
  let blocks: AutomationBlockService;
  let automationId: number;
  let unmonitorCalls: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    const automationService = new AutomationService({ db });
    const providerSettingsService = new ProviderSettingsService({ db });
    const mediaQueryService = new MediaQueryService({
      db,
      filterReadiness: filterReadinessOver(db),
    });
    blocks = new AutomationBlockService({ db });
    executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      filterReadiness: filterReadinessOver(db),
      automationBlockService: blocks,
      db,
    });
    unmonitorCalls = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'The Matrix' })])
      ),
      http.put(`${RADARR_URL}/api/v3/movie/:id`, () => {
        unmonitorCalls += 1;
        return HttpResponse.json({ id: 1, monitored: false });
      })
    );

    const radarr = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'k',
      settings: { enabledTasks: ['unmonitorMovie'] },
    });
    await providerSettingsService.create({
      type: MetadataProviderType.SEERR,
      name: 'Seerr',
      url: 'http://localhost:5055',
      apiKey: 'k',
    });
    const [job] = await db
      .insert(automations)
      .values({
        name: 'Enrichment',
        kind: 'system',
        taskId: 'system:enrichment',
        schedule: '0 * * * *',
      })
      .returning();
    await db
      .insert(automationRuns)
      .values({ automationId: job.id, status: 'success', kind: 'system' });

    const include = await mediaQueryService.create({
      name: 'All',
      contentType: 'movie',
      filters: [],
    });
    const exclude = await mediaQueryService.create({
      name: 'Requested',
      contentType: 'movie',
      filters: [{ ruleKey: 'seerrRequestStatus', value: 2 }],
    });
    const automation = await automationService.create({
      name: 'Nightly',
      queries: [
        { queryId: include.id, role: 'include' },
        { queryId: exclude.id, role: 'exclude' },
      ],
      providerId: radarr.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });
    automationId = automation.id;
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  const userRuns = () =>
    getDb()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.kind, 'user'))
      .orderBy(automationRuns.id);

  it('skips a scheduled tick and stores a block awaiting sign-off', async () => {
    await executor.execute(automationId, { trigger: 'schedule' });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped']);
    const [block] = await getDb().select().from(automationBlocks);
    expect(block).toMatchObject({ automationId, kind: 'no-data', ruleKey: 'seerrRequestStatus' });
    expect(block.signedOffAt).toBeNull();
    expect(unmonitorCalls).toBe(0);
  });

  it('runs the next scheduled tick once the block is signed off', async () => {
    await executor.execute(automationId, { trigger: 'schedule' });
    const [block] = await getDb().select().from(automationBlocks);
    await blocks.signOff(automationId, block.findingId);

    await executor.execute(automationId, { trigger: 'schedule' });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped', 'success']);
    expect(unmonitorCalls).toBe(1);
  });

  it('records a scheduled skip once while its reason is unchanged', async () => {
    await executor.execute(automationId, { trigger: 'schedule' });
    await executor.execute(automationId, { trigger: 'schedule' });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped']);
  });

  it('records every Run Now skip, so each press shows its outcome', async () => {
    await executor.execute(automationId, { trigger: 'runNow' });
    await executor.execute(automationId, { trigger: 'runNow' });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped', 'skipped']);
  });

  it('runs a Run Now past the finding the user chose to proceed past, without signing it off', async () => {
    await executor.execute(automationId, { trigger: 'schedule' });
    const [block] = await getDb().select().from(automationBlocks);

    await executor.execute(automationId, {
      trigger: 'runNow',
      consentedFindings: [block.findingId],
    });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped', 'success']);
    const [after] = await getDb().select().from(automationBlocks);
    expect(after.signedOffAt).toBeNull();
  });

  it('skips a Run Now whose consent does not cover the current finding', async () => {
    await executor.execute(automationId, { trigger: 'runNow', consentedFindings: ['stale-id'] });

    expect((await userRuns()).map((r) => r.status)).toEqual(['skipped']);
    expect(unmonitorCalls).toBe(0);
  });
});
