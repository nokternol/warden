/**
 * An automation that can no longer run is skipped, not run: the run is recorded as
 * `skipped` with the reason, and nothing reaches the actuator.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, automationRunItems, automationRuns } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus, type DomainEvents } from '@server/kernel/eventBus';
import logger from '@server/kernel/logger';
import { AutomationExecutor, excessiveReach } from '@server/modules/automations/automationExecutor';
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
      db,
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

  it('skips an automation whose own provider has been deactivated, naming that provider', async () => {
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, []);
    await providerSettingsService.update(own.id, { isActive: false });

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.status).toBe('skipped');
    expect(run.error).toBe(
      `Radarr instance ${own.id}, this automation's provider, is not an active provider`
    );
    expect(unmonitorCalls).toBe(0);
  });

  // No rule is `required` yet, so no real filter can make a query unavailable.
  it('skips an automation whose query needs a provider type that is not configured', async () => {
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, [{ ruleKey: 'watched', value: true }]);
    vi.spyOn(mediaQueryService, 'getHealthForAutomation').mockResolvedValue({
      status: 'unavailable',
      providerStatus: [
        {
          providerType: MetadataProviderType.TAUTULLI,
          required: true,
          configured: false,
          affectedFilterKeys: ['watched'],
        },
      ],
      qualificationIssues: [],
    });

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.status).toBe('skipped');
    expect(run.error).toBe('Watched filter needs a Tautulli provider, which is not configured');
    expect(unmonitorCalls).toBe(0);
  });

  it('runs again once the problem is fixed, since validity is derived on each run', async () => {
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, []);
    await providerSettingsService.update(own.id, { isActive: false });
    await executor.execute(automation.id);

    await providerSettingsService.update(own.id, { isActive: true });
    await executor.execute(automation.id);

    const runs = await getDb().select().from(automationRuns).orderBy(automationRuns.id);
    expect(runs.map((r) => r.status)).toEqual(['skipped', 'success']);
  });

  it('announces the skipped run on the event bus, carrying the reason', async () => {
    const bus = new DomainEventBus();
    const completed: DomainEvents['run:completed'][] = [];
    bus.on('run:completed', (event) => completed.push(event));
    const db = getDb();
    const publishing = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      eventBus: bus,
    });
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, []);
    await providerSettingsService.update(own.id, { isActive: false });

    await publishing.execute(automation.id);

    const [run] = await db.select().from(automationRuns);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      automationId: automation.id,
      status: 'skipped',
      itemCount: 0,
      error: run.error,
      runId: run.id,
    });
  });

  it('names the raw filter key when no rule is registered for it', async () => {
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, []);
    vi.spyOn(mediaQueryService, 'getHealthForAutomation').mockResolvedValue({
      status: 'degraded',
      providerStatus: [],
      qualificationIssues: [{ filterKey: 'retiredRule', providerId: 99, reason: 'not_active' }],
    });

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.error).toBe(
      'retiredRule filter names Provider instance 99, which is not an active provider'
    );
  });

  it('names the raw filter key when a missing provider affects an unregistered rule', async () => {
    const own = await seedRadarr('Own Radarr');
    const automation = await seedAutomationOver(own.id, []);
    vi.spyOn(mediaQueryService, 'getHealthForAutomation').mockResolvedValue({
      status: 'unavailable',
      providerStatus: [
        {
          providerType: MetadataProviderType.TAUTULLI,
          required: true,
          configured: false,
          affectedFilterKeys: ['retiredRule'],
        },
      ],
      qualificationIssues: [],
    });

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.error).toBe('retiredRule filter needs a Tautulli provider, which is not configured');
  });

  describe('hardening', () => {
    const movies = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        createRadarrMovie({ id: i + 1, title: `T${i}`, tags: [1] })
      );

    it('will not filter on play history that has not been loaded, since none reads as unwatched', async () => {
      const radarr = await seedRadarr('Radarr');
      await providerSettingsService.create({
        type: MetadataProviderType.TAUTULLI,
        name: 'Tautulli',
        url: 'http://localhost:8181',
        apiKey: 'k',
      });
      const automation = await seedAutomationOver(radarr.id, [
        { ruleKey: 'watched', value: false },
      ]);

      await executor.execute(automation.id);

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('skipped');
      expect(run.error).toMatch(/has not finished loading/);
      expect(unmonitorCalls).toBe(0);
    });

    it('will not filter on play history when nothing connected can supply it', async () => {
      const radarr = await seedRadarr('Radarr');
      const automation = await seedAutomationOver(radarr.id, [
        { ruleKey: 'watched', value: false },
      ]);

      await executor.execute(automation.id);

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('skipped');
      expect(run.error).toMatch(/no connected provider/);
    });

    it('will not exclude on play history that has not been loaded, since nothing would be protected', async () => {
      const radarr = await seedRadarr('Radarr');
      await providerSettingsService.create({
        type: MetadataProviderType.TAUTULLI,
        name: 'Tautulli',
        url: 'http://localhost:8181',
        apiKey: 'k',
      });
      const include = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      const exclude = await mediaQueryService.create({
        name: 'Watched',
        contentType: 'movie',
        filters: [{ ruleKey: 'watched', value: true }],
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

      await executor.execute(automation.id);

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('skipped');
      expect(unmonitorCalls).toBe(0);
    });

    it('still filters on fields a source supplies itself, with no enrichment loaded', async () => {
      const radarr = await seedRadarr('Radarr');
      const automation = await seedAutomationOver(radarr.id, [tagsOf(radarr.id)]);

      await executor.execute(automation.id);

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('success');
      expect(unmonitorCalls).toBe(1);
    });

    it('runs what the automation is when its turn comes, not when it was queued', async () => {
      const radarr = await seedRadarr('Radarr');
      const first = await seedAutomationOver(radarr.id, []);
      const second = await seedAutomationOver(radarr.id, []);
      const running = Promise.all([executor.execute(first.id), executor.execute(second.id)]);
      await automationService.updateStatus(second.id, 'disabled');
      await running;

      const runs = await getDb().select().from(automationRuns);
      expect(runs.map((r) => r.automationId)).toEqual([first.id]);
    });

    async function destructiveAutomation() {
      const radarr = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Radarr',
        url: `${RADARR_URL}/api/v3`,
        apiKey: 'test-key',
        settings: { enabledTasks: ['deleteMovieWithFiles'] },
      });
      const query = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      return automationService.create({
        name: 'Purge',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: radarr.id,
        taskId: 'deleteMovieWithFiles',
        schedule: '0 2 * * *',
      });
    }

    it('will not run a destructive task over most of a library', async () => {
      let deletes = 0;
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies(40))),
        http.delete(`${RADARR_URL}/api/v3/movie/:id`, () => {
          deletes += 1;
          return HttpResponse.json({});
        })
      );
      const automation = await destructiveAutomation();

      await executor.execute(automation.id);

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('skipped');
      expect(run.error).toMatch(/40 of 40 titles/);
      expect(deletes).toBe(0);
    });

    it('records a run as running before its task acts', async () => {
      let statusDuringTask: string | undefined;
      const radarr = await seedRadarr('Radarr');
      const automation = await seedAutomationOver(radarr.id, []);
      server.use(
        http.put(`${RADARR_URL}/api/v3/movie/:id`, async () => {
          const [run] = await getDb().select().from(automationRuns);
          statusDuringTask = run?.status;
          return HttpResponse.json({ id: 1, monitored: false });
        })
      );

      await executor.execute(automation.id);

      expect(statusDuringTask).toBe('running');
      const runs = await getDb().select().from(automationRuns);
      expect(runs.map((r) => r.status)).toEqual(['success']);
    });

    it('closes a run a restart cut off, stating some items may have changed', async () => {
      const radarr = await seedRadarr('Radarr');
      const automation = await seedAutomationOver(radarr.id, []);
      const runService = new AutomationRunService({ db: getDb() });
      await runService.beginRun({
        automationId: automation.id,
        kind: 'user',
        targets: { contentType: 'movie', items: [] },
      });

      await runService.closeInterruptedRuns();

      const [run] = await getDb().select().from(automationRuns);
      expect(run.status).toBe('error');
      expect(run.error).toMatch(/may have changed/);
      const after = await automationService.getById(automation.id);
      expect(after.lastRun?.status).toBe('error');
    });

    it('takes turns between automations on one provider', async () => {
      const radarr = await seedRadarr('Radarr');
      const first = await seedAutomationOver(radarr.id, []);
      const second = await seedAutomationOver(radarr.id, []);
      let active = 0;
      let mostAtOnce = 0;
      server.use(
        http.put(`${RADARR_URL}/api/v3/movie/:id`, async () => {
          active += 1;
          mostAtOnce = Math.max(mostAtOnce, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
          return HttpResponse.json({ id: 1, monitored: false });
        })
      );

      await Promise.all([executor.execute(first.id), executor.execute(second.id)]);

      expect(mostAtOnce).toBe(1);
      const runs = await getDb().select().from(automationRuns);
      expect(runs.map((r) => r.status)).toEqual(['success', 'success']);
    });

    it('judges reach on copies, since copies of one title share an actuator id', () => {
      const task = { destructive: true } as never;
      expect(excessiveReach({ task, matchedCount: 80, poolSize: 80 })).toMatch(/80 of 80/);
      expect(excessiveReach({ task, matchedCount: 40, poolSize: 80 })).toBeUndefined();
      expect(excessiveReach({ task, matchedCount: 10, poolSize: 10 })).toBeUndefined();
    });

    it('reports an automation as running only while it is', async () => {
      const radarr = await seedRadarr('Radarr');
      const automation = await seedAutomationOver(radarr.id, []);
      const running = executor.execute(automation.id);
      expect(executor.isRunning(automation.id)).toBe(true);
      await running;
      expect(executor.isRunning(automation.id)).toBe(false);
    });
  });
});
