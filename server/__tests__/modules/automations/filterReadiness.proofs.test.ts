import { buildContainer } from '@server/container';
/**
 * What "is this filter list ready to act on?" answers today, at the points where a change to
 * that answer could let an automation act on the wrong titles or stop one that should run.
 *
 * Two kinds of test live here:
 * - **Safety pins**: behaviour that protects the library. Asserted on the run's status and on
 *   the actuator never being called, never on message wording.
 * - **Readiness behaviour**: what saved queries and runs report for the filter problems the
 *   readiness reviews proved, each pinned at the behaviour that fixed it.
 *
 * Run: vitest run --project server
 */
import {
  MetadataProviderType,
  automationRuns,
  automations,
  mediaIdentity,
  mediaItems,
  mediaQueryFilterValues,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ConflictError, ValidationError } from '@server/kernel/errors';
import { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import type { MediaEnricher, MediaItem } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { EnrichmentJob } from '@server/modules/media/enrichmentJob';
import { matchItems } from '@server/modules/media/mediaQueryEngine';
import type { Filter, NormalizedMovie } from '@server/modules/media/ruleRegistry';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { PlexProvider, ProviderSettingsService } from '@server/modules/providers';
import { IdentityResolutionJob } from '@server/modules/providers/identityResolutionJob';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { desc, eq } from 'drizzle-orm';
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
const NOW = Math.floor(Date.now() / 1000);

describe('filter readiness, as automations see it', () => {
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
    mediaQueryService = new MediaQueryService({ db, filterReadiness: filterReadinessOver(db) });
    executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      filterReadiness: filterReadinessOver(getDb()),
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

  function seedRadarr() {
    return providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie'] },
    });
  }

  async function automationOver(
    providerId: number,
    queryIds: { id: number; role: 'include' | 'exclude' }[]
  ) {
    return automationService.create({
      name: 'Nightly',
      queries: queryIds.map(({ id, role }) => ({ queryId: id, role })),
      providerId,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });
  }

  async function latestRun() {
    const [run] = await getDb()
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.kind, 'user'))
      .orderBy(desc(automationRuns.id));
    return run;
  }

  /** The enrichment system job, with one finished run of `status`. */
  async function enrichmentRan(status: 'success' | 'error') {
    const db = getDb();
    const [job] = await db
      .insert(automations)
      .values({
        name: 'Enrichment',
        kind: 'system',
        taskId: 'system:enrichment',
        schedule: '0 * * * *',
      })
      .returning();
    await db.insert(automationRuns).values({ automationId: job.id, status, kind: 'system' });
  }

  describe('safety pins', () => {
    it('refuses to save a query on a rule the scope declaration defers', async () => {
      // `tmdbStatus` is produced only by TMDB, which the scope declaration defers.
      await expect(
        mediaQueryService.create({
          name: 'Released',
          contentType: 'movie',
          filters: [{ ruleKey: 'tmdbStatus', value: 'Released' }],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('stops a run whose filter only a deferred provider type could supply', async () => {
      const radarr = await seedRadarr();
      const include = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      const exclude = await mediaQueryService.create({
        name: 'Released',
        contentType: 'movie',
        filters: [],
      });
      // Written past `create`'s validation, as a query saved before the rule was deferred.
      await getDb()
        .insert(mediaQueryFilterValues)
        .values({ mediaQueryId: exclude.id, filterKey: 'tmdbStatus', value: 'Released' });
      const automation = await automationOver(radarr.id, [
        { id: include.id, role: 'include' },
        { id: exclude.id, role: 'exclude' },
      ]);

      await executor.execute(automation.id);

      const run = await latestRun();
      expect(run.status).toBe('skipped');
      expect(run.error).toMatch(/^TMDB status filter/);
      expect(unmonitorCalls).toBe(0);
    });

    it('stops a run whose stored filter names a rule that no longer exists, even in an exclude', async () => {
      const radarr = await seedRadarr();
      const include = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      const exclude = await mediaQueryService.create({
        name: 'Keep',
        contentType: 'movie',
        filters: [],
      });
      // Written past `create`'s validation, as a rule removed from the registry leaves it.
      await getDb()
        .insert(mediaQueryFilterValues)
        .values({ mediaQueryId: exclude.id, filterKey: 'retiredRule', value: 'x' });
      const automation = await automationOver(radarr.id, [
        { id: include.id, role: 'include' },
        { id: exclude.id, role: 'exclude' },
      ]);

      await executor.execute(automation.id);

      // Readiness refuses the run before the engine's own throw on an unknown rule is reached.
      const run = await latestRun();
      expect(run.status).toBe('skipped');
      expect(run.error).toMatch(/no longer exists: retiredRule/);
      expect(unmonitorCalls).toBe(0);
    });

    it('refuses to delete a query an automation excludes, so the exclude keeps protecting its titles', async () => {
      const radarr = await seedRadarr();
      server.use(
        http.get(`${RADARR_URL}/api/v3/movie`, () =>
          HttpResponse.json([
            createRadarrMovie({ id: 1, title: 'Kept', tags: [1] }),
            createRadarrMovie({ id: 2, title: 'Dropped', tags: [] }),
          ])
        )
      );
      const include = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      const exclude = await mediaQueryService.create({
        name: 'Tagged',
        contentType: 'movie',
        filters: [{ ruleKey: 'tagIds', value: { providerId: radarr.id, ids: [1] } }],
      });
      const automation = await automationOver(radarr.id, [
        { id: include.id, role: 'include' },
        { id: exclude.id, role: 'exclude' },
      ]);

      await expect(mediaQueryService.delete(exclude.id)).rejects.toThrow(ConflictError);
      expect((await automationService.getById(automation.id)).queries).toHaveLength(2);

      await executor.execute(automation.id);
      expect((await latestRun()).status).toBe('success');
      expect(unmonitorCalls).toBe(1);
    });
  });

  describe('saved queries show the findings that stop a run', () => {
    it('reports a query naming a rule that no longer exists as broken', async () => {
      const query = await mediaQueryService.create({
        name: 'Keep',
        contentType: 'movie',
        filters: [],
      });
      await getDb()
        .insert(mediaQueryFilterValues)
        .values({ mediaQueryId: query.id, filterKey: 'retiredRule', value: 'x' });

      const [listed] = await mediaQueryService.list();
      expect(listed.health.findings.map((f) => f.kind)).toContain('unknown-rule');
      expect(listed.health.queryList).toBe('broken');
    });

    it('reports a movie query on Monitored as having no movie library when only Sonarr is configured', async () => {
      await providerSettingsService.create({
        type: MetadataProviderType.SONARR,
        name: 'Sonarr',
        url: 'http://localhost:8989/api/v3',
        apiKey: 'k',
      });
      const query = await mediaQueryService.create({
        name: 'Monitored movies',
        contentType: 'movie',
        filters: [{ ruleKey: 'monitored', value: true }],
      });
      expect(query.health.findings.map((f) => f.kind)).toEqual(['no-library']);
    });

    it('reports a filterless query as having no movie library with no provider configured at all', async () => {
      const query = await mediaQueryService.create({
        name: 'All',
        contentType: 'movie',
        filters: [],
      });
      expect(query.health.findings.map((f) => f.kind)).toEqual(['no-library']);
    });
  });

  describe('a filter whose field holds no value', () => {
    it('blocks a scheduled run using a Seerr filter while no title holds Seerr data, saying so rather than that data is loading', async () => {
      // A library where nobody has requested anything through Seerr is a legitimate state;
      // nothing distinguishes it from data that failed to load, so only a user can accept it.
      const radarr = await seedRadarr();
      await providerSettingsService.create({
        type: MetadataProviderType.SEERR,
        name: 'Seerr',
        url: 'http://localhost:5055',
        apiKey: 'k',
      });
      await enrichmentRan('success');
      const db = getDb();
      const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
      await new EnrichmentQueries({ db }).replaceFields(identity.id, { playCount: 1 });
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
      const automation = await automationOver(radarr.id, [
        { id: include.id, role: 'include' },
        { id: exclude.id, role: 'exclude' },
      ]);

      await executor.execute(automation.id);

      const run = await latestRun();
      expect(run.status).toBe('skipped');
      expect(run.error).toBe(
        'Seerr request status filter has no data: no movie holds a value for it'
      );
    });
  });
});

describe('a non-source actuator whose query names a source instance', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  /** A Plex actuator over one Radarr instance's pooled catalog of two tagged movies. */
  async function plexOverPooledRadarr() {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    const automationService = new AutomationService({ db });
    const mediaQueryService = new MediaQueryService({
      db,
      filterReadiness: filterReadinessOver(db),
    });
    const radarr = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'k',
    });
    const plex = await providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: 'http://localhost:32400',
      apiKey: 'plex-token',
      settings: { enabledTasks: ['deleteFromLibrary'] },
    });

    const items = [1, 2].map((n) => ({
      _sourceIds: { radarr: n, providerId: radarr.id, tmdb: n * 100 },
      title: `Movie ${n}`,
      tags: [7],
    }));
    for (const n of [1, 2]) {
      const [{ id }] = await db
        .insert(mediaIdentity)
        .values({ kind: 'movie', tmdbId: n * 100, title: `Movie ${n}`, plexRatingKey: `rk-${n}` })
        .returning({ id: mediaIdentity.id });
      await db
        .insert(mediaItems)
        .values({ providerId: radarr.id, externalId: n, mediaIdentityId: id });
    }

    const plexInstance = new PlexProvider(
      { name: 'Plex', url: 'http://localhost:32400', apiKey: 'plex-token', settings: {} },
      getChildLogger('filterReadinessProofs')
    );
    const deleteFromLibrary = vi
      .spyOn(plexInstance, 'deleteFromLibrary')
      .mockResolvedValue(undefined);
    const executor = new AutomationExecutor({
      automationService,
      automationRunService: new AutomationRunService({ db }),
      providerSettingsService,
      mediaQueryService,
      filterReadiness: filterReadinessOver(db),
      providerFactory: { create: () => plexInstance },
      mediaSourceFactory: {
        sourcesFor: async () => [
          {
            providerId: radarr.id,
            name: 'Radarr',
            source: {
              getMediaItems: async () => items as unknown as MediaItem[],
              idOf: (item: MediaItem) => (item._sourceIds as { radarr?: number }).radarr,
            },
          },
        ],
      },
      db,
    });
    return {
      db,
      radarr,
      plex,
      items,
      executor,
      mediaQueryService,
      automationService,
      providerSettingsService,
      deleteFromLibrary,
    };
  }

  it("runs, since the engine matches an instance-qualified filter on the pooled catalog by each title's own source instance", async () => {
    // A non-source actuator acts on the pooled catalogs of every source, so a filter value need
    // only name an active source instance, never the automation's own provider.
    const {
      db,
      radarr,
      plex,
      items,
      executor,
      mediaQueryService,
      automationService,
      deleteFromLibrary,
    } = await plexOverPooledRadarr();
    const filter: Filter = { ruleKey: 'tagIds', value: { providerId: radarr.id, ids: [7] } };
    const query = await mediaQueryService.create({
      name: 'Tagged',
      contentType: 'movie',
      filters: [filter],
    });
    const automation = await automationService.create({
      name: 'Clean Plex',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: plex.id,
      taskId: 'deleteFromLibrary',
      schedule: '0 2 * * *',
    });

    expect(matchItems(items as unknown as NormalizedMovie[], [filter], 'movie')).toHaveLength(2);

    await executor.execute(automation.id);

    const [run] = await db.select().from(automationRuns);
    expect(run.status).toBe('success');
    expect(deleteFromLibrary).toHaveBeenCalledWith(['rk-1', 'rk-2']);
  });

  it('is refused when its filter names an active instance that is not a source of the content type', async () => {
    // A tag id minted by a Sonarr instance matches no movie, so the exclude would protect nothing.
    const {
      plex,
      executor,
      mediaQueryService,
      automationService,
      providerSettingsService,
      deleteFromLibrary,
    } = await plexOverPooledRadarr();
    const sonarr = await providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'k',
    });
    const include = await mediaQueryService.create({
      name: 'All',
      contentType: 'movie',
      filters: [],
    });
    const exclude = await mediaQueryService.create({
      name: 'Keep',
      contentType: 'movie',
      filters: [{ ruleKey: 'tagIds', value: { providerId: sonarr.id, ids: [7] } }],
    });
    const automation = await automationService.create({
      name: 'Clean Plex',
      queries: [
        { queryId: include.id, role: 'include' },
        { queryId: exclude.id, role: 'exclude' },
      ],
      providerId: plex.id,
      taskId: 'deleteFromLibrary',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    const [run] = await getDb().select().from(automationRuns);
    expect(run.status).toBe('skipped');
    expect(run.error).toBe(
      `Tags filter names Sonarr instance ${sonarr.id}, which is not a Radarr provider`
    );
    expect(deleteFromLibrary).not.toHaveBeenCalled();
  });
});

describe('what "the latest enrichment run succeeded" does and does not say', () => {
  let queries: EnrichmentQueries;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    queries = new EnrichmentQueries({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  function enricher(provider: MetadataProviderType, fields: Partial<MediaItem>): MediaEnricher {
    return {
      enrich: vi.fn(async (items: MediaItem[]) => ({
        provider,
        items: items.map((item) => ({ ...item, ...fields }) as MediaItem),
      })),
    };
  }

  it('fails the whole run when one enricher fails, writing nothing from the enrichers that answered', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 1, enrichedAt: NOW - 2 * 86400 })
      .returning();
    const plex = enricher(MetadataProviderType.PLEX, { playCount: 3 });
    const seerr: MediaEnricher = {
      enrich: vi.fn(async () => {
        throw new Error('Seerr unreachable');
      }),
    };

    await expect(
      new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [plex, seerr] }).run()
    ).rejects.toThrow('Seerr unreachable');

    expect(await queries.getByIdentityIds([identity.id])).toEqual(new Map());
    const [after] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.id, identity.id));
    expect(after.enrichedAt).toBe(NOW - 2 * 86400);
  });

  it("drops a title's stored fields that a write does not repeat", async () => {
    // So an enrichment run that carried on past a failed enricher would erase that
    // enricher's earlier values rather than keep them.
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 1 })
      .returning();
    await queries.replaceFields(identity.id, { playCount: 3, seerrRequestStatus: 2 });

    await queries.replaceFields(identity.id, { playCount: 4 });

    expect((await queries.getByIdentityIds([identity.id])).get(identity.id)).toEqual({
      playCount: 4,
    });
  });

  it('does not re-read titles enriched within a day when a provider is connected after that run', async () => {
    const db = getDb();
    const bus = new DomainEventBus();
    const providerSettingsService = new ProviderSettingsService({ db, eventBus: bus });
    const enrichedAt = NOW - 3600;
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 1, enrichedAt });

    await providerSettingsService.create({
      type: MetadataProviderType.TAUTULLI,
      name: 'Tautulli',
      url: 'http://localhost:8181',
      apiKey: 'k',
    });
    const tautulli = enricher(MetadataProviderType.TAUTULLI, { playCount: 5 });
    const enriched = await new EnrichmentJob({
      db,
      enrichmentQueries: queries,
      enrichers: [tautulli],
    }).run();

    expect(enriched).toBe(0);
    expect(tautulli.enrich).not.toHaveBeenCalled();
    const [after] = await db.select().from(mediaIdentity);
    expect(after.enrichedAt).toBe(enrichedAt);
  });
  it('re-reads a title once identity resolution links it to a newly connected Jellyfin server', async () => {
    // The Plex counterpart is pinned in identityResolutionJob.test.ts.
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 100, enrichedAt: NOW - 3600 });
    const jellyfinProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ Id: 'jf-42', Type: 'Movie', ProviderIds: { Tmdb: '100' } }]),
    };

    await new IdentityResolutionJob({ db, jellyfinProvider } as never).runForJellyfin();

    const [after] = await db.select().from(mediaIdentity);
    expect(after.jellyfinItemId).toBe('jf-42');
    expect(after.enrichedAt).toBeNull();
  });
});

describe('when a module singleton starts listening on the event bus', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('subscribes on first resolve, not when the container is built', () => {
    const container = buildContainer({ config: testConfig, db: getDb() });
    const bus = container.cradle.eventBus as unknown as {
      emitter: { listenerCount(event: string): number };
    };
    const before = bus.emitter.listenerCount('provider:changed');

    void container.cradle.activeFieldSetCache;

    expect(bus.emitter.listenerCount('provider:changed')).toBe(before + 1);
  });
});
