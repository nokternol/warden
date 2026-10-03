import { MetadataProviderType, mediaIdentity, mediaItems } from '@server/database/schema';
/**
 * AutomationExecutor + AutomationRunService integration test.
 *
 * Verifies that each executor.execute() call creates a row in automation_runs.
 * Uses real DB and MSW for HTTP interception.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { IdentityResolutionJob } from '@server/modules/providers/identityResolutionJob';
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

describe('AutomationExecutor writes to automation_runs', () => {
  let automationService: AutomationService;
  let automationRunService: AutomationRunService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;
  let executor: AutomationExecutor;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    automationService = new AutomationService({ db });
    automationRunService = new AutomationRunService({ db });
    providerSettingsService = new ProviderSettingsService({ db });
    mediaQueryService = new MediaQueryService({ db });
    executor = new AutomationExecutor({
      automationService,
      automationRunService,
      providerSettingsService,
      mediaQueryService,
    });
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  it('creates an automation_run row with status=success after a successful execution', async () => {
    const movies = [createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999, hasFile: true })];
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
      http.put(`${RADARR_URL}/api/v3/movie/:id`, () =>
        HttpResponse.json({ id: 1, monitored: false })
      )
    );

    const provider = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
    });
    const query = await mediaQueryService.create({
      name: 'Q',
      contentType: 'movie',
      filterValues: [],
    });
    const automation = await automationService.create({
      name: 'Nightly',
      querySources: [{ queryId: query.id, role: 'include' as const }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    const runs = await automationRunService.listRuns({ automationId: automation.id });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');
    expect(runs[0].itemCount).toBe(1);
    expect(runs[0].automationName).toBe('Nightly');
  });

  it('creates an automation_run row with status=error after a failed execution', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => new HttpResponse(null, { status: 500 }))
    );

    const provider = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
    });
    const query = await mediaQueryService.create({
      name: 'Q',
      contentType: 'movie',
      filterValues: [],
    });
    const automation = await automationService.create({
      name: 'Nightly',
      querySources: [{ queryId: query.id, role: 'include' as const }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    const runs = await automationRunService.listRuns({ automationId: automation.id });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('error');
    expect(runs[0].error).toBeTruthy();
  });

  describe('what a run targeted', () => {
    async function seedRadarrAutomation() {
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Test Radarr',
        url: `${RADARR_URL}/api/v3`,
        apiKey: 'test-key',
        settings: { enabledTasks: ['unmonitorMovie'] },
      });
      const query = await mediaQueryService.create({
        name: 'Q',
        contentType: 'movie',
        filterValues: [],
      });
      const automation = await automationService.create({
        name: 'Nightly',
        querySources: [{ queryId: query.id, role: 'include' as const }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 2 * * *',
      });
      return { provider, automation };
    }

    /** A source copy as the identity job leaves it: one group, one media_item row. */
    async function seedSourceCopy(
      providerId: number,
      movie: { id: number; tmdbId: number; title: string }
    ) {
      const db = getDb();
      const [{ id: identityId }] = await db
        .insert(mediaIdentity)
        .values({ kind: 'movie', tmdbId: movie.tmdbId, title: movie.title })
        .returning({ id: mediaIdentity.id });
      const [{ id }] = await db
        .insert(mediaItems)
        .values({ providerId, externalId: movie.id, mediaIdentityId: identityId })
        .returning({ id: mediaItems.id });
      return id;
    }

    function serveRadarr(movies: ReturnType<typeof createRadarrMovie>[]) {
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, () => HttpResponse.json({}))
      );
    }

    it('records each item a source-actuator run targeted, and counts exactly those', async () => {
      const movies = [
        createRadarrMovie({ id: 1, tmdbId: 101, title: 'The Matrix' }),
        createRadarrMovie({ id: 2, tmdbId: 102, title: 'Heat' }),
      ];
      serveRadarr(movies);
      const { provider, automation } = await seedRadarrAutomation();
      for (const movie of movies) await seedSourceCopy(provider.id, movie);

      await executor.execute(automation.id);

      const [run] = await automationRunService.listRuns({ automationId: automation.id });
      const items = await automationRunService.listRunItems(run.id);
      expect(items.data.map((i) => i.title).sort()).toEqual(['Heat', 'The Matrix']);
      expect(run.itemCount).toBe(items.data.length);
    });

    it('records a targeted item the identity job has not seen yet', async () => {
      serveRadarr([createRadarrMovie({ id: 7, tmdbId: 107, title: 'Heat', year: 1995 })]);
      const { automation } = await seedRadarrAutomation();

      await executor.execute(automation.id);

      const [run] = await automationRunService.listRuns({ automationId: automation.id });
      const items = await automationRunService.listRunItems(run.id);
      expect(items.data.map((i) => [i.title, i.year])).toEqual([['Heat', 1995]]);
      expect(run.itemCount).toBe(1);
    });

    it("keeps a removed item's title in the run's history, flagged as deleted", async () => {
      const movie = createRadarrMovie({ id: 3, tmdbId: 103, title: 'Ronin' });
      serveRadarr([movie]);
      const { provider, automation } = await seedRadarrAutomation();
      await executor.execute(automation.id);

      await new IdentityResolutionJob({
        db: getDb(),
        movieSources: [{ providerId: provider.id, provider: { getMovies: async () => [] } }],
      }).runForMovies();

      const [run] = await automationRunService.listRuns({ automationId: automation.id });
      const items = await automationRunService.listRunItems(run.id);
      expect(items.data.map((i) => [i.title, i.deleted])).toEqual([['Ronin', true]]);
    });

    it('records the items a run targeted even when its task fails', async () => {
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () =>
          HttpResponse.json([createRadarrMovie({ id: 4, tmdbId: 104, title: 'Alien' })])
        ),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, () => new HttpResponse(null, { status: 400 }))
      );
      const { automation } = await seedRadarrAutomation();

      await executor.execute(automation.id);

      const [run] = await automationRunService.listRuns({ automationId: automation.id });
      expect(run.status).toBe('error');
      const items = await automationRunService.listRunItems(run.id);
      expect(items.data.map((i) => i.title)).toEqual(['Alien']);
      expect(run.itemCount).toBe(1);
    });
  });
});
