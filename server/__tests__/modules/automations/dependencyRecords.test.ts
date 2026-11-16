/**
 * A destructive run does not act when a provider it depends on failed its last refresh or has
 * never refreshed (north-star belief 7); a non-destructive run proceeds. Nothing here judges a
 * run by how much it would affect.
 */
import { MetadataProviderType, automationRuns } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import { AutomationBlockService } from '@server/modules/automations/automationBlockService';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import type { Filter } from '@server/modules/media';
import { LibraryCache } from '@server/modules/media/libraryCache';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import {
  PlexProvider,
  ProviderSettingsService,
  RadarrProvider,
  recordRefreshFailed,
  recordRefreshed,
} from '@server/modules/providers';
import { createRadarrMovie } from '@tests/factories';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { refreshCopies } from '@tests/helpers/library';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

const log = getChildLogger('dependencyRecords');

describe('runs and the refresh records they depend on', () => {
  let providerSettingsService: ProviderSettingsService;
  let automationService: AutomationService;
  let mediaQueryService: MediaQueryService;
  let radarrA: number;
  let radarrB: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    providerSettingsService = new ProviderSettingsService({ db });
    automationService = new AutomationService({ db });
    mediaQueryService = new MediaQueryService({ db, filterReadiness: filterReadinessOver(db) });
    const tasks = { enabledTasks: ['deleteMovieWithFiles', 'triggerSearch'] };
    ({ id: radarrA } = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr A',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'k',
      settings: tasks,
    }));
    ({ id: radarrB } = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr B',
      url: 'http://localhost:7879/api/v3',
      apiKey: 'k',
    }));
    await refreshCopies(db, [
      { providerId: radarrA, name: 'Radarr A', rows: [createRadarrMovie({ id: 1, tmdbId: 100 })] },
      { providerId: radarrB, name: 'Radarr B', rows: [createRadarrMovie({ id: 9, tmdbId: 900 })] },
    ]);
    for (const id of [radarrA, radarrB]) await recordRefreshed(db, id, 'lists');
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  /** Runs an automation on `providerId` once, returning the run and what the task was handed. */
  async function runOnce(opts: {
    providerId: number;
    connection: RadarrProvider | PlexProvider;
    act: { mock: { calls: unknown[] } };
    taskId: string;
    include?: Filter[];
    exclude?: Filter[];
  }) {
    const db = getDb();
    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      automationBlockService: new AutomationBlockService({ db }),
      filterReadiness: filterReadinessOver(db),
      providerFactory: { create: () => opts.connection },
      libraryCache: new LibraryCache({ db, eventBus: new DomainEventBus() }),
      db,
    });
    const included = await mediaQueryService.create({
      name: 'Included',
      contentType: 'movie',
      filters: opts.include ?? [],
    });
    const queries: Array<{ queryId: number; role: 'include' | 'exclude' }> = [
      { queryId: included.id, role: 'include' },
    ];
    if (opts.exclude) {
      const excluded = await mediaQueryService.create({
        name: 'Excluded',
        contentType: 'movie',
        filters: opts.exclude,
      });
      queries.push({ queryId: excluded.id, role: 'exclude' });
    }
    const automation = await automationService.create({
      name: 'Under test',
      queries,
      providerId: opts.providerId,
      taskId: opts.taskId,
      schedule: '0 2 * * *',
    });
    await executor.execute(automation.id);
    const [run] = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.automationId, automation.id));
    return { run, acted: opts.act.mock.calls.length > 0 };
  }

  function radarrConnection() {
    const connection = new RadarrProvider(
      { name: 'Radarr A', url: 'http://localhost:7878/api/v3', apiKey: 'k', settings: {} },
      log
    );
    const deleteMovies = vi.spyOn(connection, 'deleteMovies').mockResolvedValue(undefined);
    const search = vi.spyOn(connection, 'triggerMoviesSearch').mockResolvedValue(undefined);
    return { connection, deleteMovies, search };
  }

  it('skips a destructive Radarr run, naming the instance, while its own catalog refresh failed', async () => {
    await recordRefreshFailed(getDb(), radarrA, 'catalog', 'Radarr timed out');
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
    });

    expect(acted).toBe(false);
    expect(run.status).toBe('skipped');
    expect(run.error).toMatch(/Radarr A/);
    expect(run.error).toMatch(/catalog/);
    expect(run.freshnessAsOf).toEqual(expect.any(Number));
    expect(JSON.parse(run.freshnessStale ?? '[]')).toContainEqual({
      provider: 'Radarr A',
      kind: 'catalog',
      failed: true,
    });
  });

  it('records how current the copy was on a run skipped for a filter problem', async () => {
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      include: [{ ruleKey: 'tagIds', value: { providerId: 999, ids: [1] } }],
    });

    expect(acted).toBe(false);
    expect(run.status).toBe('skipped');
    expect(run.freshnessAsOf).toEqual(expect.any(Number));
    expect(JSON.parse(run.freshnessStale ?? 'null')).toEqual([]);
  });

  it('runs a non-destructive task while a catalog refresh it depends on failed', async () => {
    await recordRefreshFailed(getDb(), radarrA, 'catalog', 'Radarr timed out');
    const { connection, search } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: search,
      taskId: 'triggerSearch',
    });

    expect(acted).toBe(true);
    expect(run.status).toBe('success');
  });

  it("runs a destructive Radarr A task with no excludes while only Radarr B's catalog failed", async () => {
    await recordRefreshFailed(getDb(), radarrB, 'catalog', 'down');
    const { connection, deleteMovies } = radarrConnection();

    const { acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
    });

    expect(acted).toBe(true);
  });

  it("skips a destructive Radarr A task with an exclude, naming Radarr B, while B's catalog failed", async () => {
    await recordRefreshFailed(getDb(), radarrB, 'catalog', 'down');
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      exclude: [{ ruleKey: 'title', value: 'nothing' }],
    });

    expect(acted).toBe(false);
    expect(run.error).toMatch(/Radarr B/);
  });

  it("skips a destructive Plex run, naming Radarr B, while B's catalog failed", async () => {
    const db = getDb();
    const { id: plexId } = await providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: 'http://localhost:32400',
      apiKey: 'token',
      settings: { enabledTasks: ['deleteFromLibrary'] },
    });
    await recordRefreshed(db, plexId, 'links');
    await recordRefreshed(db, plexId, 'facts');
    await recordRefreshFailed(db, radarrB, 'catalog', 'down');
    const connection = new PlexProvider(
      { name: 'Plex', url: 'http://localhost:32400', apiKey: 'token', settings: {} },
      log
    );
    const deleteFromLibrary = vi.spyOn(connection, 'deleteFromLibrary').mockResolvedValue();

    const { run, acted } = await runOnce({
      providerId: plexId,
      connection,
      act: deleteFromLibrary,
      taskId: 'deleteFromLibrary',
    });

    expect(acted).toBe(false);
    expect(run.error).toMatch(/Radarr B/);
  });

  it('skips a destructive run whose excluded query uses a Seerr rule while Seerr has no facts yet', async () => {
    await providerSettingsService.create({
      type: MetadataProviderType.SEERR,
      name: 'Seerr',
      url: 'http://localhost:5055',
      apiKey: 'k',
    });
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      exclude: [{ ruleKey: 'seerrRequestStatus', value: 2 }],
    });

    expect(acted).toBe(false);
    expect(run.error).toMatch(/Seerr/);
    expect(run.error).toMatch(/facts/);
  });

  it("runs a non-destructive automation on last-watched while Tautulli's facts refresh failed", async () => {
    const { id: tautulli } = await providerSettingsService.create({
      type: MetadataProviderType.TAUTULLI,
      name: 'Tautulli',
      url: 'http://localhost:8181',
      apiKey: 'k',
    });
    await recordRefreshFailed(getDb(), tautulli, 'facts', 'Tautulli timed out');
    const { connection, search } = radarrConnection();

    const { run } = await runOnce({
      providerId: radarrA,
      connection,
      act: search,
      taskId: 'triggerSearch',
      include: [{ ruleKey: 'lastWatchedDaysAgo', value: { min: 30 } }],
    });

    expect(run.status).toBe('success');
  });

  /** Active Plex and Jellyfin servers, both with refreshed links, supplying play count. */
  async function mediaServers() {
    const db = getDb();
    const { id: plex } = await providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: 'http://localhost:32400',
      apiKey: 'token',
    });
    const { id: jellyfin } = await providerSettingsService.create({
      type: MetadataProviderType.JELLYFIN,
      name: 'Jellyfin',
      url: 'http://localhost:8096',
      apiKey: 'k',
      settings: { userId: 'u' },
    });
    for (const id of [plex, jellyfin]) await recordRefreshed(db, id, 'links');
    return { plex, jellyfin };
  }

  it('acts when a fact it filters on is still supplied by another refreshed provider', async () => {
    const { plex, jellyfin } = await mediaServers();
    await recordRefreshFailed(getDb(), plex, 'facts', 'Plex timed out');
    await recordRefreshed(getDb(), jellyfin, 'facts');
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      exclude: [{ ruleKey: 'watched', value: true }],
    });

    expect(run.error).toBeNull();
    expect(acted).toBe(true);
  });

  it('skips, naming the fact and its suppliers, when no supplier of a fact it filters on is refreshed', async () => {
    const { plex } = await mediaServers();
    await recordRefreshFailed(getDb(), plex, 'facts', 'Plex timed out');
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      exclude: [{ ruleKey: 'watched', value: true }],
    });

    expect(acted).toBe(false);
    expect(run.error).toMatch(/Watched/);
    expect(run.error).toMatch(/Plex/);
    expect(run.error).toMatch(/Jellyfin/);
  });

  it('skips a destructive run that depends on a provider never refreshed', async () => {
    await getDb().delete(automationRuns);
    await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr C',
      url: 'http://localhost:7880/api/v3',
      apiKey: 'k',
    });
    const { connection, deleteMovies } = radarrConnection();

    const { run, acted } = await runOnce({
      providerId: radarrA,
      connection,
      act: deleteMovies,
      taskId: 'deleteMovieWithFiles',
      exclude: [{ ruleKey: 'title', value: 'nothing' }],
    });

    expect(acted).toBe(false);
    expect(run.error).toMatch(/Radarr C/);
    expect(run.error).toMatch(/not refreshed yet/);
  });
});
