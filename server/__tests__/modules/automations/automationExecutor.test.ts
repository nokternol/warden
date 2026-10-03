import type { ContentType } from '@contract/schemas';
import {
  MetadataProviderType,
  automationRuns,
  automations,
  mediaIdentity,
  mediaItems,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus, type DomainEvents } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationScheduler } from '@server/modules/automations/automationScheduler';
import { AutomationService } from '@server/modules/automations/automationService';
import type { MediaItem } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import type { FilterValueEntry } from '@server/modules/media/filterRegistry';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import {
  type IProviderFactory,
  PlexProvider,
  ProviderSettingsService,
  type RadarrMovie,
  RadarrProvider,
  SonarrProvider,
  type SonarrSeries,
  TautulliProvider,
} from '@server/modules/providers';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRadarrMovie, createSonarrSeries } from '../../../../tests/factories';
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
const SONARR_URL = 'http://localhost:8989';

const mockConnectionLogger = getChildLogger('AutomationExecutorTestConnection');

const mockRadarrConfig: ProviderConfig = {
  name: 'Mock Radarr',
  url: RADARR_URL,
  apiKey: 'k',
  settings: {},
};

const mockSonarrConfig: ProviderConfig = {
  name: 'Mock Sonarr',
  url: SONARR_URL,
  apiKey: 'k',
  settings: {},
};

/**
 * A real `RadarrProvider` instance with its native fetch and action methods
 * stubbed — `mediaSourceFor`'s `instanceof` dispatch requires a real instance,
 * not a duck-typed object, so tests build one instead of a `MediaSource` literal.
 */
function radarrSource(
  movies: RadarrMovie[],
  actions: {
    unmonitorMovies?: (ids: number[]) => Promise<void>;
    triggerMoviesSearch?: (ids: number[]) => Promise<void>;
  } = {}
): RadarrProvider {
  const provider = new RadarrProvider(mockRadarrConfig, mockConnectionLogger);
  vi.spyOn(provider, 'getMovies').mockResolvedValue(movies);
  if (actions.unmonitorMovies) {
    vi.spyOn(provider, 'unmonitorMovies').mockImplementation(actions.unmonitorMovies);
  }
  if (actions.triggerMoviesSearch) {
    vi.spyOn(provider, 'triggerMoviesSearch').mockImplementation(actions.triggerMoviesSearch);
  }
  return provider;
}

/** The `SonarrProvider` counterpart to `radarrSource`. */
function sonarrSource(
  series: SonarrSeries[],
  actions: {
    unmonitorSeries?: (ids: number[]) => Promise<void>;
    triggerSeriesSearch?: (ids: number[]) => Promise<void>;
  } = {}
): SonarrProvider {
  const provider = new SonarrProvider(mockSonarrConfig, mockConnectionLogger);
  vi.spyOn(provider, 'getSeries').mockResolvedValue(series);
  if (actions.unmonitorSeries) {
    vi.spyOn(provider, 'unmonitorSeries').mockImplementation(actions.unmonitorSeries);
  }
  if (actions.triggerSeriesSearch) {
    vi.spyOn(provider, 'triggerSeriesSearch').mockImplementation(actions.triggerSeriesSearch);
  }
  return provider;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function seedRadarrProvider(providerSettingsService: ProviderSettingsService) {
  return providerSettingsService.create({
    type: MetadataProviderType.RADARR,
    name: 'Test Radarr',
    url: `${RADARR_URL}/api/v3`,
    apiKey: 'test-api-key',
    settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
  });
}

async function seedSonarrProvider(providerSettingsService: ProviderSettingsService) {
  return providerSettingsService.create({
    type: MetadataProviderType.SONARR,
    name: 'Test Sonarr',
    url: `${SONARR_URL}/api/v3`,
    apiKey: 'test-api-key',
    settings: { enabledTasks: ['unmonitorSeries', 'triggerSearch', 'deleteSeriesWithFiles'] },
  });
}

async function seedMediaQuery(
  mediaQueryService: MediaQueryService,
  filterValues: FilterValueEntry[] = [],
  contentType: ContentType = 'movie'
) {
  return mediaQueryService.create({ name: 'Test Query', contentType, filterValues });
}

async function seedAutomation(
  automationService: AutomationService,
  opts: { queryId: number; providerId: number; taskId: string; taskParameter?: string }
) {
  return automationService.create({
    name: 'Test Automation',
    querySources: [{ queryId: opts.queryId, role: 'include' }],
    providerId: opts.providerId,
    taskId: opts.taskId,
    taskParameter: opts.taskParameter,
    schedule: '0 * * * *',
  });
}

async function seedSystemTask(taskId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(automations)
    .values({ name: `sys:${taskId}`, taskId, schedule: '0 * * * *', kind: 'system' })
    .returning();
  return row.id;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutomationExecutor', () => {
  let automationService: AutomationService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;
  let executor: AutomationExecutor;

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
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  // ─── SYSTEM: kind-based dispatch ──────────────────────────────────────────

  describe('SYSTEM — kind dispatch', () => {
    async function seedSystemAutomation(taskId: string): Promise<number> {
      const db = getDb();
      const [row] = await db
        .insert(automations)
        .values({ name: `sys:${taskId}`, taskId, schedule: '0 * * * *', kind: 'system' })
        .returning();
      return row.id;
    }

    it('runs the system task and records a success run with kind=system, without the provider path', async () => {
      const db = getDb();
      const run = vi.fn(async () => 0);
      const systemExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run },
      });
      const id = await seedSystemAutomation('system:identity-resolution');

      await systemExecutor.execute(id);

      expect(run).toHaveBeenCalledWith('system:identity-resolution');
      const runs = await db.select().from(automationRuns);
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('success');
      expect(runs[0].kind).toBe('system');
    });

    it('records the runner-reported changed count as itemCount, not a hardcoded 0', async () => {
      const db = getDb();
      const run = vi.fn(async () => 5);
      const systemExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run },
      });
      const id = await seedSystemAutomation('system:enrichment');

      await systemExecutor.execute(id);

      const runs = await db.select().from(automationRuns);
      expect(runs).toHaveLength(1);
      expect(runs[0].itemCount).toBe(5);
    });

    it('records no targeted items for a system run, whatever count its runner reports', async () => {
      const db = getDb();
      const automationRunService = new AutomationRunService({ db });
      const systemExecutor = new AutomationExecutor({
        automationService,
        automationRunService,
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run: async () => 5 },
      });
      const id = await seedSystemAutomation('system:identity-resolution');

      await systemExecutor.execute(id);

      const [run] = await automationRunService.listRuns({ automationId: id });
      expect(await automationRunService.listRunItems(run.id)).toEqual({ data: [], total: 0 });
    });

    it('does not start a second run while a run for the same id is in flight', async () => {
      const db = getDb();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const run = vi.fn(async () => {
        await gate;
        return 0;
      });
      const guardedExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run },
      });
      const id = await seedSystemAutomation('system:identity-resolution');

      const first = guardedExecutor.execute(id);
      const second = guardedExecutor.execute(id);
      release();
      await Promise.all([first, second]);

      expect(run).toHaveBeenCalledTimes(1);
      const runs = await db.select().from(automationRuns);
      expect(runs).toHaveLength(1);
    });
  });

  // ─── RADARR: unmonitorMovie ───────────────────────────────────────────────

  describe('RADARR — unmonitorMovie', () => {
    it('sends PUT /movie/{id} with monitored:false for each matched movie', async () => {
      const monitoredMovies = [
        createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999, hasFile: true }),
        createRadarrMovie({ id: 2, title: 'Interstellar', year: 2014, hasFile: true }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(monitoredMovies)),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, async ({ params, request }) => {
          const body = (await request.json()) as { monitored: boolean };
          if (body.monitored === false) unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual(expect.arrayContaining([1, 2]));
      expect(unmonitored).toHaveLength(2);
    });

    it('applies query filters before executing the task', async () => {
      const movies = [
        createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999, hasFile: true }),
        createRadarrMovie({ id: 2, title: 'Inception', year: 2010, hasFile: false }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, async ({ params }) => {
          unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: true }]);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });

    it('applies boolean hasFile:true filter (native boolean, not string)', async () => {
      const movies = [
        createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999, hasFile: true }),
        createRadarrMovie({ id: 2, title: 'Inception', year: 2010, hasFile: false }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, async ({ params }) => {
          unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: true }]);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });

    it('records a successful run with the item count', async () => {
      const movies = [createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999 })];

      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, () =>
          HttpResponse.json({ id: 1, monitored: false })
        )
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await executor.execute(automation.id);

      const updated = await automationService.list();
      const dto = updated.find((a) => a.id === automation.id)!;
      expect(dto.lastRun).toBeDefined();
      expect(dto.lastRun!.status).toBe('success');
      expect(dto.lastRun!.itemCount).toBe(1);
    });

    it('records an error run when the provider call fails', async () => {
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => new HttpResponse(null, { status: 500 }))
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await executor.execute(automation.id);

      const updated = await automationService.list();
      const dto = updated.find((a) => a.id === automation.id)!;
      expect(dto.lastRun).toBeDefined();
      expect(dto.lastRun!.status).toBe('error');
    });
  });

  // ─── Enablement enforcement at run time ───────────────────────────────────

  describe('per-instance enablement enforcement', () => {
    it('records an error run for a task no longer enabled on the instance, without calling the provider', async () => {
      let movieEndpointHit = false;
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => {
          movieEndpointHit = true;
          return HttpResponse.json([createRadarrMovie({ id: 1, title: 'A', hasFile: true })]);
        }),
        http.put(`${RADARR_URL}/api/v3/movie/:id`, () =>
          HttpResponse.json({ id: 1, monitored: false })
        )
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      // The task was enabled at create time; the operator later disables it.
      await providerSettingsService.update(provider.id, { settings: { enabledTasks: [] } });

      await executor.execute(automation.id);

      const [dto] = await automationService.list();
      expect(dto.lastRun!.status).toBe('error');
      expect(dto.lastRun!.error).toMatch(/not enabled/i);
      expect(movieEndpointHit).toBe(false);
    });
  });

  // ─── RADARR: triggerSearch ────────────────────────────────────────────────

  describe('RADARR — triggerSearch', () => {
    it('posts MoviesSearch command with all matched movie IDs', async () => {
      const movies = [
        createRadarrMovie({ id: 1, title: 'The Matrix', year: 1999, hasFile: false }),
        createRadarrMovie({ id: 2, title: 'Interstellar', year: 2014, hasFile: false }),
      ];

      let commandBody: unknown = null;
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.post(`${RADARR_URL}/api/v3/command`, async ({ request }) => {
          commandBody = await request.json();
          return HttpResponse.json({ id: 1 });
        })
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'triggerSearch',
      });

      await executor.execute(automation.id);

      expect(commandBody).toEqual({ name: 'MoviesSearch', movieIds: [1, 2] });
    });

    it('records success with the matched item count', async () => {
      const movies = [createRadarrMovie({ id: 3, title: 'Dune', year: 2021, hasFile: false })];

      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(movies)),
        http.post(`${RADARR_URL}/api/v3/command`, () => HttpResponse.json({ id: 1 }))
      );

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'triggerSearch',
      });

      await executor.execute(automation.id);

      const [dto] = await automationService.list();
      expect(dto.lastRun!.status).toBe('success');
      expect(dto.lastRun!.itemCount).toBe(1);
    });
  });

  // ─── SONARR: unmonitorSeries ──────────────────────────────────────────────

  describe('SONARR — unmonitorSeries', () => {
    it('sends PUT /series/{id} with monitored:false for each matched series', async () => {
      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, status: 'ended' }),
        createSonarrSeries({ id: 2, title: 'The Wire', year: 2002, status: 'ended' }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.put(`${SONARR_URL}/api/v3/series/:id`, async ({ params, request }) => {
          const body = (await request.json()) as { monitored: boolean };
          if (body.monitored === false) unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [], 'series');
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual(expect.arrayContaining([1, 2]));
      expect(unmonitored).toHaveLength(2);
    });

    it('applies query filters before unmonitoring', async () => {
      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, status: 'ended' }),
        createSonarrSeries({ id: 2, title: 'Ongoing Show', year: 2020, status: 'continuing' }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.put(`${SONARR_URL}/api/v3/series/:id`, async ({ params }) => {
          unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(
        mediaQueryService,
        [{ key: 'seriesStatus', value: 'ended' }],
        'series'
      );
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });

    it('applies boolean monitored:false filter (native boolean, not string)', async () => {
      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, monitored: false }),
        createSonarrSeries({ id: 2, title: 'Ongoing Show', year: 2020, monitored: true }),
      ];

      const unmonitored: number[] = [];
      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.put(`${SONARR_URL}/api/v3/series/:id`, async ({ params }) => {
          unmonitored.push(Number(params.id));
          return HttpResponse.json({ id: Number(params.id), monitored: false });
        })
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(
        mediaQueryService,
        [{ key: 'monitored', value: false }],
        'series'
      );
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      await executor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });

    it('records a successful run with the item count', async () => {
      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, status: 'ended' }),
      ];

      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.put(`${SONARR_URL}/api/v3/series/:id`, () =>
          HttpResponse.json({ id: 1, monitored: false })
        )
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [], 'series');
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      await executor.execute(automation.id);

      const [dto] = await automationService.list();
      expect(dto.lastRun!.status).toBe('success');
      expect(dto.lastRun!.itemCount).toBe(1);
    });
  });

  // ─── SONARR: triggerSearch ────────────────────────────────────────────────

  describe('SONARR — triggerSearch', () => {
    it('posts SeriesSearch command for each matched series ID', async () => {
      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, status: 'ended' }),
        createSonarrSeries({ id: 2, title: 'The Wire', year: 2002, status: 'ended' }),
      ];

      const commandBodies: unknown[] = [];
      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.post(`${SONARR_URL}/api/v3/command`, async ({ request }) => {
          commandBodies.push(await request.json());
          return HttpResponse.json({ id: 1 });
        })
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [], 'series');
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'triggerSearch',
      });

      await executor.execute(automation.id);

      expect(commandBodies).toHaveLength(2);
      expect(commandBodies).toEqual(
        expect.arrayContaining([
          { name: 'SeriesSearch', seriesId: 1 },
          { name: 'SeriesSearch', seriesId: 2 },
        ])
      );
    });

    it('records success with the matched item count', async () => {
      const seriesList = [
        createSonarrSeries({ id: 5, title: 'Severance', year: 2022, status: 'continuing' }),
      ];

      server.use(
        http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(seriesList)),
        http.post(`${SONARR_URL}/api/v3/command`, () => HttpResponse.json({ id: 1 }))
      );

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [], 'series');
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'triggerSearch',
      });

      await executor.execute(automation.id);

      const [dto] = await automationService.list();
      expect(dto.lastRun!.status).toBe('success');
      expect(dto.lastRun!.itemCount).toBe(1);
    });
  });

  // ─── Injected factory ────────────────────────────────────────────────────

  describe('injected ProviderFactory', () => {
    it('calls factory.create() and executes the task — no HTTP stub needed', async () => {
      const movies = [createRadarrMovie({ id: 10, title: 'Dune', year: 2021 })];
      const unmonitored: number[] = [];

      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });

      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      const executorWithFactory = new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await executorWithFactory.execute(automation.id);

      expect(unmonitored).toEqual([10]);
    });

    it('routes factory.create() to the correct provider type for Sonarr', async () => {
      const seriesList = [createSonarrSeries({ id: 5, title: 'The Wire', year: 2002 })];
      const unmonitored: number[] = [];

      const mockSonarr = sonarrSource(seriesList, {
        unmonitorSeries: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerSeriesSearch: async () => {},
      });

      const mockFactory: IProviderFactory = { create: () => mockSonarr };

      const provider = await seedSonarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, [], 'series');
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      const executorWithFactory = new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await executorWithFactory.execute(automation.id);

      expect(unmonitored).toEqual([5]);
    });
  });

  // ─── Legacy path removal ─────────────────────────────────────────────────

  describe('legacy path removal', () => {
    it('records error when querySources is empty even if a legacy query field is defined', async () => {
      const movies = [createRadarrMovie({ id: 7, title: 'Dune', year: 2021 })];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (_: number[]) => {},
      });

      const recordRun = vi.fn();
      const mockAutomationService = {
        getById: async () => ({
          id: 99,
          name: 'Legacy Path Test',
          kind: 'user' as const,
          querySources: [],
          query: { id: 1, name: 'Q', contentType: 'movie' as const },
          provider: { id: 1, name: 'Radarr', type: 'RADARR' },
          taskId: 'unmonitorMovie',
          schedule: '0 * * * *',
          status: 'active' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        recordRun,
      };

      const mockMediaQueryService = {
        getById: async () => ({
          id: 1,
          name: 'Q',
          contentType: 'movie' as const,
          filterValues: [],
          health: { status: 'healthy' as const, providerStatus: [] },
          createdAt: new Date().toISOString(),
        }),
      };

      const mockProviderSettingsService = {
        findById: async () => ({
          id: 1,
          type: 'RADARR',
          name: 'Radarr',
          url: 'http://localhost:7878',
          apiKey: null,
          settings: { enabledTasks: ['unmonitorMovie'] },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      const legacyExecutor = new AutomationExecutor({
        automationService: mockAutomationService as unknown as AutomationService,
        mediaQueryService: mockMediaQueryService as unknown as MediaQueryService,
        providerSettingsService: mockProviderSettingsService as unknown as ProviderSettingsService,
        providerFactory: { create: () => mockRadarr },
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await legacyExecutor.execute(99);

      expect(recordRun).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          status: 'error',
          error: expect.stringMatching(/no query sources/i),
        })
      );
    });
  });

  // ─── contentType discriminator ───────────────────────────────────────────

  describe('contentType discriminator', () => {
    it('routes to the movie path when query.contentType is "movie"', async () => {
      const movies = [createRadarrMovie({ id: 7, title: 'Dune', year: 2021 })];
      const unmonitored: number[] = [];

      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });

      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const mockAutomationService = {
        getById: async () => ({
          id: 99,
          name: 'Discriminator Test',
          kind: 'user' as const,
          querySources: [{ queryId: 1, role: 'include' as const, sortOrder: 0 }],
          query: { id: 1, name: 'Q', contentType: 'movie' as const },
          provider: { id: 1, name: 'Radarr', type: 'RADARR' },
          taskId: 'unmonitorMovie',
          schedule: '0 * * * *',
          status: 'active' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        recordRun: vi.fn(),
      };

      const mockMediaQueryService = {
        getById: async () => ({
          id: 1,
          name: 'Q',
          contentType: 'movie' as const,
          filterValues: [],
          health: { status: 'healthy' as const, providerStatus: [] },
          createdAt: new Date().toISOString(),
        }),
      };

      const mockProviderSettingsService = {
        findById: async () => ({
          id: 1,
          type: 'RADARR',
          name: 'Radarr',
          url: 'http://localhost:7878',
          apiKey: null,
          settings: { enabledTasks: ['unmonitorMovie'] },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      const executorWithMocks = new AutomationExecutor({
        automationService: mockAutomationService as unknown as AutomationService,
        mediaQueryService: mockMediaQueryService as unknown as MediaQueryService,
        providerSettingsService: mockProviderSettingsService as unknown as ProviderSettingsService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await executorWithMocks.execute(99);

      expect(unmonitored).toEqual([7]);
    });
  });

  // ─── Tier 2 enrichment filtering ─────────────────────────────────────────

  describe('Tier 2 enrichment — watched filter uses tautulliPlayCount from DB', () => {
    it('only executes task on movies whose enrichment row shows playCount > 0', async () => {
      const db = getDb();

      const movies = [
        createRadarrMovie({ id: 1, title: 'Watched Movie', hasFile: true }),
        createRadarrMovie({ id: 2, title: 'Unwatched Movie', hasFile: true }),
      ];

      const provider = await seedRadarrProvider(providerSettingsService);

      // Seed media_identity + a media_item copy for movie 1 + enrichment (playCount=3)
      const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
      await db
        .insert(mediaItems)
        .values({ providerId: provider.id, externalId: 1, mediaIdentityId: identity.id });
      await new EnrichmentQueries({ db }).replaceFields(identity.id, { playCount: 3 });

      const unmonitored: number[] = [];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });
      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const query = await seedMediaQuery(mediaQueryService, [{ key: 'watched', value: true }]);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      const enrichedExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        db,
      });

      await enrichedExecutor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });
  });

  describe('Tier 2 enrichment — lastWatchedDaysAgo filter uses lastWatchedAt from DB', () => {
    it('only executes task on movies whose enrichment row shows lastPlayed >= N days ago', async () => {
      const db = getDb();
      const tenDaysAgoUnix = Math.floor((Date.now() - 10 * 86_400_000) / 1000);

      const movies = [
        createRadarrMovie({ id: 10, title: 'Old Play', hasFile: true }),
        createRadarrMovie({ id: 11, title: 'Recent Play', hasFile: true }),
        createRadarrMovie({ id: 12, title: 'Never Played', hasFile: true }),
      ];

      const provider = await seedRadarrProvider(providerSettingsService);

      const [id10] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
      await db
        .insert(mediaItems)
        .values({ providerId: provider.id, externalId: 10, mediaIdentityId: id10.id });
      await new EnrichmentQueries({ db }).replaceFields(id10.id, {
        lastWatchedAt: new Date(tenDaysAgoUnix * 1000).toISOString(),
      });

      const twoDaysAgoUnix = Math.floor((Date.now() - 2 * 86_400_000) / 1000);
      const [id11] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
      await db
        .insert(mediaItems)
        .values({ providerId: provider.id, externalId: 11, mediaIdentityId: id11.id });
      await new EnrichmentQueries({ db }).replaceFields(id11.id, {
        lastWatchedAt: new Date(twoDaysAgoUnix * 1000).toISOString(),
      });

      const unmonitored: number[] = [];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });
      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const query = await seedMediaQuery(mediaQueryService, [
        { key: 'lastWatchedDaysAgo', value: { min: 7 } },
      ]);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      const enrichedExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        db,
      });

      await enrichedExecutor.execute(automation.id);

      expect(unmonitored).toEqual([10]);
    });
  });

  // ─── Tier 2 enrichment — shows ───────────────────────────────────────────

  describe('Tier 2 enrichment — watched filter on shows uses enrichment DB (mergeShowEnrichment)', () => {
    it('only executes task on shows whose enrichment row shows playCount > 0', async () => {
      const db = getDb();

      const seriesList = [
        createSonarrSeries({ id: 1, title: 'Watched Show', status: 'ended' }),
        createSonarrSeries({ id: 2, title: 'Unwatched Show', status: 'ended' }),
      ];

      const provider = await seedSonarrProvider(providerSettingsService);

      // Seed media_identity + a media_item copy for series 1 + enrichment (playCount=5)
      const [identity] = await db.insert(mediaIdentity).values({ kind: 'series' }).returning();
      await db
        .insert(mediaItems)
        .values({ providerId: provider.id, externalId: 1, mediaIdentityId: identity.id });
      await new EnrichmentQueries({ db }).replaceFields(identity.id, { playCount: 5 });

      const unmonitored: number[] = [];
      const mockSonarr = sonarrSource(seriesList, {
        unmonitorSeries: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerSeriesSearch: async () => {},
      });
      const mockFactory: IProviderFactory = { create: () => mockSonarr };
      const query = await seedMediaQuery(
        mediaQueryService,
        [{ key: 'watched', value: true }],
        'series'
      );
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorSeries',
      });

      const enrichedExecutor = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        db,
      });

      await enrichedExecutor.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });
  });

  // ─── Combination model ───────────────────────────────────────────────────

  describe('CombinationModel — multiple include sources', () => {
    it('executes task only on items surviving include-minus-exclude (difference semantics)', async () => {
      // Movie 1: hasFile:true,  qualityProfileId:10 → include set only → survives
      // Movie 2: hasFile:false, qualityProfileId:10 → neither set
      // Movie 3: hasFile:true,  qualityProfileId:20 → in include AND exclude → excluded
      // Expected: task fires only on movie 1
      const movies = [
        createRadarrMovie({ id: 1, title: 'Keep', hasFile: true, qualityProfileId: 10 }),
        createRadarrMovie({ id: 2, title: 'Skip', hasFile: false, qualityProfileId: 10 }),
        createRadarrMovie({ id: 3, title: 'Remove', hasFile: true, qualityProfileId: 20 }),
      ];

      const unmonitored: number[] = [];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });
      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const provider = await seedRadarrProvider(providerSettingsService);
      // include: all hasFile:true movies → [1, 3]
      const includeQuery = await seedMediaQuery(mediaQueryService, [
        { key: 'hasFile', value: true },
      ]);
      // exclude: qualityProfileId 20 → [3]
      const excludeQuery = await seedMediaQuery(mediaQueryService, [
        { key: 'qualityProfileIds', value: '20' },
      ]);

      const automation = await automationService.create({
        name: 'Difference Test',
        querySources: [
          { queryId: includeQuery.id, role: 'include' },
          { queryId: excludeQuery.id, role: 'exclude' },
        ],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const executorWithFactory = new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await executorWithFactory.execute(automation.id);

      expect(unmonitored).toEqual([1]);
    });

    it('executes task on the union of two non-overlapping include source results', async () => {
      const movies = [
        createRadarrMovie({ id: 1, title: 'A', hasFile: true }),
        createRadarrMovie({ id: 2, title: 'B', hasFile: false }),
        createRadarrMovie({ id: 3, title: 'C', hasFile: true }),
      ];

      const unmonitored: number[] = [];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });
      const mockFactory: IProviderFactory = { create: () => mockRadarr };

      const provider = await seedRadarrProvider(providerSettingsService);
      // Query A: only hasFile:true → movies 1 and 3
      const queryA = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: true }]);
      // Query B: only hasFile:false → movie 2
      const queryB = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: false }]);

      const automation = await automationService.create({
        name: 'Multi-include',
        querySources: [
          { queryId: queryA.id, role: 'include' },
          { queryId: queryB.id, role: 'include' },
        ],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const executorWithFactory = new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await executorWithFactory.execute(automation.id);

      expect(new Set(unmonitored)).toEqual(new Set([1, 2, 3]));
    });
  });

  // ─── Provider creation hoist ─────────────────────────────────────────────

  describe('provider creation hoist', () => {
    it('calls factory.create() exactly once even with two include sources', async () => {
      const movies = [
        createRadarrMovie({ id: 1, title: 'A', hasFile: true }),
        createRadarrMovie({ id: 2, title: 'B', hasFile: false }),
      ];
      const unmonitored: number[] = [];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async (ids: number[]) => {
          unmonitored.push(...ids);
        },
        triggerMoviesSearch: async () => {},
      });

      const createSpy = vi.fn().mockReturnValue(mockRadarr);
      const mockFactory: IProviderFactory = { create: createSpy };

      const provider = await seedRadarrProvider(providerSettingsService);
      const queryA = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: true }]);
      const queryB = await seedMediaQuery(mediaQueryService, [{ key: 'hasFile', value: false }]);

      const automation = await automationService.create({
        name: 'Hoist Test',
        querySources: [
          { queryId: queryA.id, role: 'include' },
          { queryId: queryB.id, role: 'include' },
        ],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const hoistExecutor = new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: mockFactory,
        automationRunService: { createRun: vi.fn() } as unknown as AutomationRunService,
      });

      await hoistExecutor.execute(automation.id);

      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Domain events: run:started ──────────────────────────────────────────

  describe('domain events — run:started', () => {
    it('emits run:started with automation metadata before the run body runs', async () => {
      const db = getDb();
      const bus = new DomainEventBus();
      const started: DomainEvents['run:started'][] = [];
      bus.on('run:started', (p) => started.push(p));

      let firedBeforeBody = false;
      const run = vi.fn(async () => {
        firedBeforeBody = started.length === 1;
        return 0;
      });

      const ex = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run },
        eventBus: bus,
      });
      const id = await seedSystemTask('system:enrichment');

      await ex.execute(id);

      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({
        automationId: id,
        kind: 'system',
        taskId: 'system:enrichment',
      });
      expect(started[0].startedAt).toBeInstanceOf(Date);
      expect(firedBeforeBody).toBe(true);
    });
  });

  // ─── Domain events: run:completed (success) ──────────────────────────────

  describe('domain events — run:completed', () => {
    it('emits run:completed post-commit carrying the persisted run id and ranAt', async () => {
      const db = getDb();
      const bus = new DomainEventBus();
      const completed: DomainEvents['run:completed'][] = [];
      bus.on('run:completed', (p) => completed.push(p));

      const ex = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run: vi.fn(async () => 3) },
        eventBus: bus,
      });
      const id = await seedSystemTask('system:enrichment');

      await ex.execute(id);

      expect(completed).toHaveLength(1);
      const [row] = await db.select().from(automationRuns);
      expect(completed[0].runId).toBe(row.id);
      expect(completed[0].ranAt.getTime()).toBe(row.ranAt.getTime());
      expect(completed[0]).toMatchObject({
        automationId: id,
        kind: 'system',
        status: 'success',
        itemCount: 3,
      });
      expect(completed[0].finishedAt).toBeInstanceOf(Date);
    });
  });

  // ─── Domain events: run:completed (failure) ──────────────────────────────

  describe('domain events — run:completed on failure', () => {
    it('still emits run:completed with status error and the message when the run throws', async () => {
      const db = getDb();
      const bus = new DomainEventBus();
      const completed: DomainEvents['run:completed'][] = [];
      bus.on('run:completed', (p) => completed.push(p));

      const ex = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: {
          run: vi.fn(async () => {
            throw new Error('runner boom');
          }),
        },
        eventBus: bus,
      });
      const id = await seedSystemTask('system:enrichment');

      await ex.execute(id);

      expect(completed).toHaveLength(1);
      expect(completed[0]).toMatchObject({
        automationId: id,
        status: 'error',
        error: 'runner boom',
      });
      const [row] = await db.select().from(automationRuns);
      expect(completed[0].runId).toBe(row.id);
    });
  });

  // ─── Domain events: <scope>:changed gate ─────────────────────────────────

  describe('domain events — media:changed gate', () => {
    function makeExecutor(bus: DomainEventBus, provider: RadarrProvider) {
      return new AutomationExecutor({
        automationService,
        providerSettingsService,
        mediaQueryService,
        providerFactory: { create: () => provider },
        automationRunService: new AutomationRunService({ db: getDb() }),
        eventBus: bus,
      });
    }

    it('emits media:changed for a media-scoped task that changed at least one item', async () => {
      const bus = new DomainEventBus();
      const changes: DomainEvents['media:changed'][] = [];
      bus.on('media:changed', (p) => changes.push(p));

      const movies = [createRadarrMovie({ id: 1, title: 'A', hasFile: true })];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async () => {},
        triggerMoviesSearch: async () => {},
      });

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await makeExecutor(bus, mockRadarr).execute(automation.id);

      expect(changes).toHaveLength(1);
    });

    it('does not emit media:changed when a scoped task changed zero items', async () => {
      const bus = new DomainEventBus();
      const changes: DomainEvents['media:changed'][] = [];
      bus.on('media:changed', (p) => changes.push(p));

      const mockRadarr = radarrSource([], {
        unmonitorMovies: async () => {},
        triggerMoviesSearch: async () => {},
      });

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'unmonitorMovie',
      });

      await makeExecutor(bus, mockRadarr).execute(automation.id);

      expect(changes).toHaveLength(0);
    });

    it('does not emit media:changed for an unscoped task even when items match', async () => {
      const bus = new DomainEventBus();
      const changes: DomainEvents['media:changed'][] = [];
      bus.on('media:changed', (p) => changes.push(p));

      const movies = [createRadarrMovie({ id: 1, title: 'A', hasFile: false })];
      const mockRadarr = radarrSource(movies, {
        unmonitorMovies: async () => {},
        triggerMoviesSearch: async () => {},
      });

      const provider = await seedRadarrProvider(providerSettingsService);
      const query = await seedMediaQuery(mediaQueryService, []);
      const automation = await seedAutomation(automationService, {
        queryId: query.id,
        providerId: provider.id,
        taskId: 'triggerSearch',
      });

      await makeExecutor(bus, mockRadarr).execute(automation.id);

      expect(changes).toHaveLength(0);
    });

    it('emits media:changed for a system data job that changed items', async () => {
      const db = getDb();
      const bus = new DomainEventBus();
      const changes: DomainEvents['media:changed'][] = [];
      bus.on('media:changed', (p) => changes.push(p));

      const ex = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run: vi.fn(async () => 4) },
        eventBus: bus,
      });
      const id = await seedSystemTask('system:enrichment');

      await ex.execute(id);

      expect(changes).toHaveLength(1);
    });

    it('does not emit media:changed for a system data job that changed zero items', async () => {
      const db = getDb();
      const bus = new DomainEventBus();
      const changes: DomainEvents['media:changed'][] = [];
      bus.on('media:changed', (p) => changes.push(p));

      const ex = new AutomationExecutor({
        automationService,
        automationRunService: new AutomationRunService({ db }),
        providerSettingsService,
        mediaQueryService,
        systemTaskRunner: { run: vi.fn(async () => 0) },
        eventBus: bus,
      });
      const id = await seedSystemTask('system:identity-resolution');

      await ex.execute(id);

      expect(changes).toHaveLength(0);
    });
  });

  // ─── Scheduler wiring ────────────────────────────────────────────────────

  describe('AutomationScheduler integration', () => {
    it('calls executor.execute when a scheduled tick fires', async () => {
      let executedId: number | null = null;
      const mockExecutor = {
        execute: async (id: number) => {
          executedId = id;
        },
      };

      const scheduler = new AutomationScheduler({ automationExecutor: mockExecutor });
      scheduler.schedule({ id: 42, name: 'Test', schedule: '* * * * *' });

      await scheduler.trigger(42);
      scheduler.stopAll();

      expect(executedId).toBe(42);
    });
  });
});

describe('non-source actuators — id translation through the identity graph', () => {
  let automationService: AutomationService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    automationService = new AutomationService({ db });
    providerSettingsService = new ProviderSettingsService({ db });
    mediaQueryService = new MediaQueryService({ db });
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  /** A pooled owning-source stand-in: three Radarr-normalized movies from one instance. */
  function fakeMovieSources(radarrProviderId: number) {
    const items = [1, 2, 3].map((n) => ({
      _sourceIds: { radarr: n, providerId: radarrProviderId, tmdb: n * 100 },
      title: `Movie ${n}`,
    }));
    return {
      sourcesFor: async () => [
        {
          providerId: radarrProviderId,
          name: 'Radarr',
          source: {
            getMediaItems: async () => items,
            idOf: (item: MediaItem) => (item._sourceIds as { radarr?: number }).radarr,
          },
        },
      ],
    };
  }

  async function seedIdentityGraph(radarrProviderId: number) {
    const db = getDb();
    // movies 1 and 2 are stamped with Plex rating keys; movie 3 is not.
    for (const [externalId, plexRatingKey] of [
      [1, 'rk-1'],
      [2, 'rk-2'],
      [3, null],
    ] as Array<[number, string | null]>) {
      const [{ id: identityId }] = await db
        .insert(mediaIdentity)
        .values({
          kind: 'movie',
          tmdbId: externalId * 100,
          title: `Movie ${externalId}`,
          plexRatingKey,
        })
        .returning({ id: mediaIdentity.id });
      await db
        .insert(mediaItems)
        .values({ providerId: radarrProviderId, externalId, mediaIdentityId: identityId });
    }
  }

  async function seedPlexProvider() {
    return providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Test Plex',
      url: 'http://localhost:32400',
      apiKey: 'plex-token',
      settings: { enabledTasks: ['deleteFromLibrary'] },
    });
  }

  it('evaluates the query against the owning source and runs the task with translated Plex ids', async () => {
    const db = getDb();
    const radarrProv = await seedRadarrProvider(providerSettingsService);
    const plexProv = await seedPlexProvider();
    await seedIdentityGraph(radarrProv.id);

    const plexInstance = new PlexProvider(
      { name: 'Test Plex', url: 'http://localhost:32400', apiKey: 'plex-token', settings: {} },
      mockConnectionLogger
    );
    const deleteFromLibrary = vi
      .spyOn(plexInstance, 'deleteFromLibrary')
      .mockResolvedValue(undefined);

    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => plexInstance },
      mediaSourceFactory: fakeMovieSources(radarrProv.id),
      db,
    });

    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: plexProv.id,
      taskId: 'deleteFromLibrary',
    });

    await executor.execute(automation.id);

    expect(deleteFromLibrary).toHaveBeenCalledTimes(1);
    expect(deleteFromLibrary.mock.calls[0][0].sort()).toEqual(['rk-1', 'rk-2']);
    const runs = await db.select().from(automationRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');
    expect(runs[0].itemCount).toBe(2); // only the identities stamped with a Plex key
  });

  it('records the catalog items it addressed, not the ones with no Plex id', async () => {
    const db = getDb();
    const radarrProv = await seedRadarrProvider(providerSettingsService);
    const plexProv = await seedPlexProvider();
    await seedIdentityGraph(radarrProv.id);

    const plexInstance = new PlexProvider(
      { name: 'Test Plex', url: 'http://localhost:32400', apiKey: 'plex-token', settings: {} },
      mockConnectionLogger
    );
    vi.spyOn(plexInstance, 'deleteFromLibrary').mockResolvedValue(undefined);
    const automationRunService = new AutomationRunService({ db });
    const executor = new AutomationExecutor({
      automationService,
      automationRunService,
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => plexInstance },
      mediaSourceFactory: fakeMovieSources(radarrProv.id),
      db,
    });
    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: plexProv.id,
      taskId: 'deleteFromLibrary',
    });

    await executor.execute(automation.id);

    const [run] = await automationRunService.listRuns({ automationId: automation.id });
    const items = await automationRunService.listRunItems(run.id);
    expect(items.data.map((i) => i.title).sort()).toEqual(['Movie 1', 'Movie 2']);
    expect(run.itemCount).toBe(items.data.length);
  });

  it('counts every source copy it recorded when two instances hold one Plex title', async () => {
    const db = getDb();
    const radarrProv = await seedRadarrProvider(providerSettingsService);
    const radarr4kProv = await seedRadarrProvider(providerSettingsService);
    const plexProv = await seedPlexProvider();
    const [{ id: identityId }] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 500, title: 'Heat', plexRatingKey: 'rk-5' })
      .returning({ id: mediaIdentity.id });
    for (const providerId of [radarrProv.id, radarr4kProv.id]) {
      await db
        .insert(mediaItems)
        .values({ providerId, externalId: 5, mediaIdentityId: identityId });
    }
    const copies = [radarrProv.id, radarr4kProv.id].map((providerId) => ({
      _sourceIds: { radarr: 5, providerId, tmdb: 500 },
      title: 'Heat',
    }));

    const plexInstance = new PlexProvider(
      { name: 'Test Plex', url: 'http://localhost:32400', apiKey: 'plex-token', settings: {} },
      mockConnectionLogger
    );
    const deleteFromLibrary = vi
      .spyOn(plexInstance, 'deleteFromLibrary')
      .mockResolvedValue(undefined);
    const automationRunService = new AutomationRunService({ db });
    const executor = new AutomationExecutor({
      automationService,
      automationRunService,
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => plexInstance },
      mediaSourceFactory: {
        sourcesFor: async () => [
          {
            providerId: radarrProv.id,
            name: 'Radarr',
            source: { getMediaItems: async () => copies, idOf: () => undefined },
          },
        ],
      },
      db,
    });
    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: plexProv.id,
      taskId: 'deleteFromLibrary',
    });

    await executor.execute(automation.id);

    expect(deleteFromLibrary.mock.calls[0][0]).toEqual(['rk-5']);
    const [run] = await automationRunService.listRuns({ automationId: automation.id });
    const items = await automationRunService.listRunItems(run.id);
    expect(items.data).toHaveLength(2);
    expect(run.itemCount).toBe(2);
  });

  it('Tautulli rides the Plex addressing space end to end', async () => {
    const db = getDb();
    const radarrProv = await seedRadarrProvider(providerSettingsService);
    const tautulliProv = await providerSettingsService.create({
      type: MetadataProviderType.TAUTULLI,
      name: 'Test Tautulli',
      url: 'http://localhost:8181',
      apiKey: 'tautulli-key',
      settings: { enabledTasks: ['deleteWatchHistory'] },
    });
    await seedIdentityGraph(radarrProv.id);

    const tautulliInstance = new TautulliProvider(
      { name: 'Test Tautulli', url: 'http://localhost:8181', apiKey: 'tautulli-key', settings: {} },
      mockConnectionLogger
    );
    const deleteWatchHistory = vi
      .spyOn(tautulliInstance, 'deleteWatchHistory')
      .mockResolvedValue(undefined);

    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => tautulliInstance },
      mediaSourceFactory: fakeMovieSources(radarrProv.id),
      db,
    });

    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: tautulliProv.id,
      taskId: 'deleteWatchHistory',
    });

    await executor.execute(automation.id);

    expect(deleteWatchHistory).toHaveBeenCalledTimes(1);
    expect(deleteWatchHistory.mock.calls[0][0].sort()).toEqual(['rk-1', 'rk-2']);
  });
});

describe('task parameters — stored on the automation, threaded into run', () => {
  let automationService: AutomationService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    automationService = new AutomationService({ db });
    providerSettingsService = new ProviderSettingsService({ db });
    mediaQueryService = new MediaQueryService({ db });
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  async function seedRadarrWithParamTask() {
    return providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-api-key',
      settings: { enabledTasks: ['changeQualityProfile'] },
    });
  }

  it('passes the stored parameter value into the task run', async () => {
    const db = getDb();
    const prov = await seedRadarrWithParamTask();
    const radarr = radarrSource([createRadarrMovie({ id: 1, tmdbId: 100 })]);
    const changeQualityProfile = vi
      .spyOn(radarr, 'changeQualityProfile')
      .mockResolvedValue(undefined);

    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => radarr },
    });

    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: prov.id,
      taskId: 'changeQualityProfile',
      taskParameter: '7',
    });
    expect(automation.taskParameter).toBe('7');

    await executor.execute(automation.id);

    expect(changeQualityProfile).toHaveBeenCalledWith([1], 7);
    const runs = await db.select().from(automationRuns);
    expect(runs[0].status).toBe('success');
  });

  it('records an error run when a parameterized task has no stored value, without running it', async () => {
    const db = getDb();
    const prov = await seedRadarrWithParamTask();
    const radarr = radarrSource([createRadarrMovie({ id: 1, tmdbId: 100 })]);
    const changeQualityProfile = vi
      .spyOn(radarr, 'changeQualityProfile')
      .mockResolvedValue(undefined);

    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      providerFactory: { create: () => radarr },
    });

    const query = await seedMediaQuery(mediaQueryService);
    const automation = await seedAutomation(automationService, {
      queryId: query.id,
      providerId: prov.id,
      taskId: 'changeQualityProfile',
    });

    await executor.execute(automation.id);

    expect(changeQualityProfile).not.toHaveBeenCalled();
    const runs = await db.select().from(automationRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('error');
    expect(runs[0].error).toMatch(/requires a parameter/i);
  });
});

describe('dispatch scope declaration', () => {
  it('declares media scope on unmonitor tasks and none on triggerSearch', () => {
    const cfg = { name: 'x', url: 'http://localhost/api/v3', apiKey: 'k', settings: null };
    const radarr = new RadarrProvider(cfg, getChildLogger('scope-test')).tasks();
    const sonarr = new SonarrProvider(cfg, getChildLogger('scope-test')).tasks();
    expect(radarr.find((t) => t.id === 'unmonitorMovie')?.affects).toBe('media');
    expect(radarr.find((t) => t.id === 'triggerSearch')?.affects).toBeUndefined();
    expect(sonarr.find((t) => t.id === 'unmonitorSeries')?.affects).toBe('media');
    expect(sonarr.find((t) => t.id === 'triggerSearch')?.affects).toBeUndefined();
  });
});
