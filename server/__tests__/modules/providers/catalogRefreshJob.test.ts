import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import { CatalogRefreshJob } from '@server/modules/providers/catalogRefreshJob';
import { PlexProvider } from '@server/modules/providers/connections/plexProvider';
import type { RadarrMovie } from '@server/modules/providers/connections/radarrProvider';
import type { SonarrSeries } from '@server/modules/providers/connections/sonarrProvider';
import { readProviderLists } from '@server/modules/providers/providerLists';
import { readRefreshRecords } from '@server/modules/providers/providerRefresh';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const makeMovie = (overrides: Partial<RadarrMovie> = {}): RadarrMovie => ({
  id: 1,
  title: 'Test Movie',
  hasFile: true,
  monitored: true,
  tmdbId: 100,
  imdbId: 'tt0000001',
  profileId: 1,
  qualityProfileId: 1,
  tags: [],
  folderName: '/movies/test',
  path: '/movies/test',
  ...overrides,
});

const makeSeries = (overrides: Partial<SonarrSeries> = {}): SonarrSeries => ({
  id: 10,
  title: 'Test Series',
  status: 'continuing',
  monitored: true,
  tvdbId: 200,
  tmdbId: 300,
  imdbId: 'tt0000002',
  tvMazeId: 400,
  profileId: 1,
  qualityProfileId: 1,
  languageProfileId: 1,
  tags: [],
  path: '/tv/test',
  seasons: [],
  ...overrides,
});

describe('CatalogRefreshJob', () => {
  let radarrProviderId: number;
  let radarr4kProviderId: number;
  let sonarrProviderId: number;
  let sonarr4kProviderId: number;
  let plexProviderId: number;
  let jellyfinProviderId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    [{ id: radarrProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning({ id: metadataProviders.id });
    [{ id: radarr4kProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr 4k', url: 'http://radarr4k' })
      .returning({ id: metadataProviders.id });
    [{ id: sonarrProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.SONARR, name: 'Sonarr', url: 'http://sonarr' })
      .returning({ id: metadataProviders.id });
    [{ id: sonarr4kProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.SONARR, name: 'Sonarr 4k', url: 'http://sonarr4k' })
      .returning({ id: metadataProviders.id });
    [{ id: plexProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://plex' })
      .returning({ id: metadataProviders.id });
    [{ id: jellyfinProviderId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.JELLYFIN, name: 'Jellyfin', url: 'http://jellyfin' })
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('sets plexRatingKey on media_identity rows where a Plex guid matches by tmdbId', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ contentType: 'movie', tmdbId: 100 });

    const plexProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ ratingKey: 'plex-key-42', Guid: [{ id: 'tmdb://100' }] }]),
    };

    const job = new CatalogRefreshJob({
      db,
      plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
    });
    await job.runForPlex();

    const rows = await db.select().from(mediaIdentity);
    expect(rows[0].plexRatingKey).toBe('plex-key-42');
  });

  it('clears a Plex link whose item Plex no longer lists, and keeps links when Plex fails', async () => {
    const db = getDb();
    const plexId = plexProviderId;
    await db.insert(mediaIdentity).values([
      { contentType: 'movie', tmdbId: 100 },
      { contentType: 'movie', tmdbId: 101 },
    ]);
    const plex = {
      getAllItems: vi.fn().mockResolvedValue([
        { ratingKey: 'a', Guid: [{ id: 'tmdb://100' }] },
        { ratingKey: 'b', Guid: [{ id: 'tmdb://101' }] },
      ]),
    };
    const plexSource = { providerId: plexId, name: 'Plex', provider: plex };
    await new CatalogRefreshJob({ db, plexSource }).runForPlex();

    plex.getAllItems.mockResolvedValue([{ ratingKey: 'a', Guid: [{ id: 'tmdb://100' }] }]);
    await new CatalogRefreshJob({ db, plexSource }).runForPlex();
    const afterRemoval = await db.select().from(mediaIdentity).orderBy(mediaIdentity.tmdbId);
    expect(afterRemoval.map((r) => r.plexRatingKey)).toEqual(['a', null]);

    plex.getAllItems.mockRejectedValue(new Error('Plex is down'));
    const failing = new CatalogRefreshJob({ db, plexSource });
    await failing.runForPlex();
    const afterFailure = await db.select().from(mediaIdentity).orderBy(mediaIdentity.tmdbId);
    expect(afterFailure.map((r) => r.plexRatingKey)).toEqual(['a', null]);
    expect(failing.failedProviders()).toEqual(['Plex']);
    const records = await readRefreshRecords(db);
    expect(records).toEqual([
      expect.objectContaining({ providerId: plexId, kind: 'links', error: 'Plex is down' }),
    ]);
  });

  it('treats a malformed successful answer as a failure: keeps the copies and moves on', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 2, tmdbId: 200 })]) };
    const sources = [
      { providerId: radarrProviderId, name: 'Radarr', provider: radarrA },
      { providerId: radarr4kProviderId, name: 'Radarr 4k', provider: radarrB },
    ];
    await new CatalogRefreshJob({ db, movieSources: sources }).runForMovies();

    radarrA.getMovies.mockResolvedValue({ records: [] });
    radarrB.getMovies.mockResolvedValue([makeMovie({ id: 3, tmdbId: 300 })]);
    const job = new CatalogRefreshJob({ db, movieSources: sources });
    await job.runForMovies();

    expect(job.failedProviders()).toEqual(['Radarr']);
    const copies = await db.select().from(mediaItems).orderBy(mediaItems.externalId);
    expect(copies.map((c) => [c.externalId, c.deleted])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
    const failed = (await readRefreshRecords(db)).find((r) => r.providerId === radarrProviderId);
    expect(failed?.error).toMatch(/malformed/i);
  });

  it('treats a malformed Plex answer as a failure, keeping its links', async () => {
    const db = getDb();
    await db
      .insert(mediaIdentity)
      .values({ contentType: 'movie', tmdbId: 100, plexRatingKey: 'a' });
    const plex = { getAllItems: vi.fn().mockResolvedValue({ MediaContainer: {} }) };
    const job = new CatalogRefreshJob({
      db,
      plexSource: { providerId: plexProviderId, name: 'Plex', provider: plex },
    });

    await job.runForPlex();

    expect(job.failedProviders()).toEqual(['Plex']);
    const [title] = await db.select().from(mediaIdentity);
    expect(title.plexRatingKey).toBe('a');
  });

  it('names a provider once when both its catalog and its lists failed', async () => {
    const db = getDb();
    const down = new Error('Radarr is down');
    const provider = {
      getMovies: vi.fn().mockRejectedValue(down),
      getTags: vi.fn().mockRejectedValue(down),
      getProfiles: vi.fn().mockRejectedValue(down),
      getRootFolders: vi.fn().mockRejectedValue(down),
    };
    const source = { providerId: radarrProviderId, name: 'Radarr', provider };
    const job = new CatalogRefreshJob({ db, movieSources: [source], listSources: [source] });

    await job.runForMovies();
    await job.runForLists();

    expect(job.failedProviders()).toEqual(['Radarr']);
  });

  it("stores a provider's lists, keeping a part whose read failed and failing its lists record", async () => {
    const db = getDb();
    const radarr = {
      getTags: vi.fn().mockResolvedValue([{ id: 1, label: 'keep' }]),
      getProfiles: vi.fn().mockResolvedValue([{ id: 4, name: 'HD' }]),
      getRootFolders: vi.fn().mockResolvedValue([{ id: 2, path: '/movies' }]),
    };
    const listSources = [{ providerId: radarrProviderId, name: 'Radarr', provider: radarr }];
    await new CatalogRefreshJob({ db, listSources }).runForLists();

    radarr.getTags.mockRejectedValue(new Error('tags timed out'));
    radarr.getProfiles.mockResolvedValue([{ id: 5, name: '4K' }]);
    const job = new CatalogRefreshJob({ db, listSources });
    await job.runForLists();

    expect((await readProviderLists(db)).get(radarrProviderId)).toEqual({
      tags: [{ id: 1, label: 'keep' }],
      qualityProfiles: [{ id: 5, name: '4K' }],
      rootFolders: [{ id: 2, path: '/movies' }],
    });
    expect(job.failedProviders()).toEqual(['Radarr']);
    expect(await readRefreshRecords(db)).toEqual([
      expect.objectContaining({
        providerId: radarrProviderId,
        kind: 'lists',
        error: 'tags timed out',
      }),
    ]);
  });

  it('runForJellyfin sets jellyfinItemId where a Jellyfin ProviderIds.Tmdb matches, content-type-scoped', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ contentType: 'movie', tmdbId: 100 });
    await db.insert(mediaIdentity).values({ contentType: 'series', tmdbId: 100 });

    const jellyfinProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ Id: 'jf-42', Type: 'Movie', ProviderIds: { Tmdb: '100' } }]),
    };

    const job = new CatalogRefreshJob({
      db,
      jellyfinSource: {
        providerId: jellyfinProviderId,
        name: 'Jellyfin',
        provider: jellyfinProvider,
      },
    });
    await job.runForJellyfin();

    const movies = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.contentType, 'movie'));
    expect(movies[0].jellyfinItemId).toBe('jf-42');
    const shows = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.contentType, 'series'));
    expect(shows[0].jellyfinItemId).toBeNull();
  });

  it('runForJellyfin matches a series by ProviderIds.Tvdb', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ contentType: 'series', tvdbId: 200 });

    const jellyfinProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ Id: 'jf-show', Type: 'Series', ProviderIds: { Tvdb: '200' } }]),
    };

    const job = new CatalogRefreshJob({
      db,
      jellyfinSource: {
        providerId: jellyfinProviderId,
        name: 'Jellyfin',
        provider: jellyfinProvider,
      },
    });
    await job.runForJellyfin();

    const rows = await db.select().from(mediaIdentity);
    expect(rows[0].jellyfinItemId).toBe('jf-show');
  });

  it('runForJellyfin returns 0 without a Jellyfin provider and counts rows actually changed', async () => {
    const db = getDb();
    expect(await new CatalogRefreshJob({ db }).runForJellyfin()).toBe(0);

    await db.insert(mediaIdentity).values({ contentType: 'movie', tmdbId: 100 });
    const jellyfinProvider = {
      getAllItems: vi.fn().mockResolvedValue([
        { Id: 'jf-hit', Type: 'Movie', ProviderIds: { Tmdb: '100' } },
        { Id: 'jf-miss', Type: 'Movie', ProviderIds: { Tmdb: '999' } },
        { Id: 'jf-no-ids', Type: 'Movie' },
      ]),
    };

    const job = new CatalogRefreshJob({
      db,
      jellyfinSource: {
        providerId: jellyfinProviderId,
        name: 'Jellyfin',
        provider: jellyfinProvider,
      },
    });
    expect(await job.runForJellyfin()).toBe(1);
  });

  it('runForPlex counts rows actually changed, not Plex items processed', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ contentType: 'movie', tmdbId: 100 });

    const plexProvider = {
      getAllItems: vi.fn().mockResolvedValue([
        { ratingKey: 'plex-match', Guid: [{ id: 'tmdb://100' }] }, // updates 1 row
        { ratingKey: 'plex-miss', Guid: [{ id: 'tmdb://999' }] }, // matches no row
      ]),
    };

    const job = new CatalogRefreshJob({
      db,
      plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
    });

    expect(await job.runForPlex()).toBe(1);
  });

  it('upserts a Radarr movie into media_identity (contentType=movie) and a media_item copy for the instance', async () => {
    const db = getDb();
    const radarrProvider = { getMovies: vi.fn().mockResolvedValue([makeMovie()]) };

    const job = new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarrProvider }],
    });
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    expect(identities[0].contentType).toBe('movie');
    expect(identities[0].tmdbId).toBe(100);
    expect(identities[0].imdbId).toBe('tt0000001');

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].providerId).toBe(radarrProviderId);
    expect(items[0].externalId).toBe(1);
    expect(items[0].mediaIdentityId).toBe(identities[0].id);
  });

  it('resolves movies from every active Radarr instance, never collapsing to one', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const radarrB = {
      getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 200 })]),
    };

    const job = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrA },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job.runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.providerId).sort()).toEqual(
      [radarrProviderId, radarr4kProviderId].sort()
    );
    // Different tmdbIds → different groups, even though both instances used external id 1.
    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(2);
  });

  it('shares one group across two instances that report the same tmdbId', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 603 })]) };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 55, tmdbId: 603 })]) };

    const job = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrA },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.mediaIdentityId === identities[0].id)).toBe(true);
  });

  it('keeps a copy that left its source, marked deleted, with its group', async () => {
    const db = getDb();
    const radarr = {
      getMovies: vi
        .fn()
        .mockResolvedValue([
          makeMovie({ id: 1, tmdbId: 100, title: 'Heat' }),
          makeMovie({ id: 2, tmdbId: 200, title: 'Ronin' }),
        ]),
    };
    await new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarr }],
    }).runForMovies();

    radarr.getMovies.mockResolvedValue([makeMovie({ id: 2, tmdbId: 200, title: 'Ronin' })]);
    await new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarr }],
    }).runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items.map((i) => [i.externalId, i.deleted])).toEqual([
      [1, true],
      [2, false],
    ]);
    const groups = await db.select().from(mediaIdentity);
    expect(groups.map((g) => g.title)).toContain('Heat');
  });

  it("believes a source's successful empty answer, marking its copies removed", async () => {
    const db = getDb();
    const radarr = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const job = new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarr }],
    });
    await job.runForMovies();

    radarr.getMovies.mockResolvedValue([]);
    await job.runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items.map((i) => i.deleted)).toEqual([true]);
    expect(job.failedProviders()).toEqual([]);
  });

  it('lets requests run while it works through a library', async () => {
    const db = getDb();
    const radarr = {
      getMovies: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 20 }, (_, i) => makeMovie({ id: i + 1, tmdbId: 1000 + i }))
        ),
    };
    let turns = 0;
    let done = false;
    const countTurns = () => {
      turns += 1;
      if (!done) setImmediate(countTurns);
    };
    setImmediate(countTurns);

    await new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarr }],
    }).runForMovies();
    done = true;

    expect(turns).toBeGreaterThanOrEqual(20);
  });

  it('clears the deleted mark when the source lists the item again', async () => {
    const db = getDb();
    const radarr = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const job = new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarr }],
    });
    await job.runForMovies();
    radarr.getMovies.mockResolvedValueOnce([makeMovie({ id: 2, tmdbId: 200 })]);
    await job.runForMovies();

    await job.runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items.find((i) => i.externalId === 1)?.deleted).toBe(false);
  });

  it('marks a media_item row no longer reported by its instance deleted without touching other instances', async () => {
    const db = getDb();
    const radarrA = {
      getMovies: vi
        .fn()
        .mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 }), makeMovie({ id: 3, tmdbId: 300 })]),
    };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 2, tmdbId: 200 })]) };
    const job = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrA },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job.runForMovies();

    // Movie 1 is removed from instance A's library; instance B is untouched.
    const radarrANowEmpty = {
      getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 3, tmdbId: 300 })]),
    };
    const job2 = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrANowEmpty },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job2.runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items.map((i) => [i.providerId, i.externalId, i.deleted])).toEqual([
      [radarrProviderId, 1, true],
      [radarrProviderId, 3, false],
      [radarr4kProviderId, 2, false],
    ]);
  });

  it('sweeps a group left with no media_item rows once its provider is deleted', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 2, tmdbId: 200 })]) };
    await new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrA },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    }).runForMovies();
    expect(await db.select().from(mediaIdentity)).toHaveLength(2);

    await db.delete(metadataProviders).where(eq(metadataProviders.id, radarrProviderId));
    await new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarr4kProviderId, name: 'Instance', provider: radarrB }],
    }).runForMovies();

    const groups = await db.select().from(mediaIdentity);
    expect(groups.map((g) => g.tmdbId)).toEqual([200]);
  });

  it('does not sweep a group still held by another instance after one instance prunes its copy', async () => {
    const db = getDb();
    const radarrA = {
      getMovies: vi
        .fn()
        .mockResolvedValue([makeMovie({ id: 1, tmdbId: 603 }), makeMovie({ id: 3, tmdbId: 300 })]),
    };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 603 })]) };
    const job = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrA },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job.runForMovies();

    const radarrAEmpty = {
      getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 3, tmdbId: 300 })]),
    };
    const job2 = new CatalogRefreshJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, name: 'Instance', provider: radarrAEmpty },
        { providerId: radarr4kProviderId, name: 'Instance', provider: radarrB },
      ],
    });
    await job2.runForMovies();

    expect(await db.select().from(mediaIdentity)).toHaveLength(2);
    const items = await db.select().from(mediaItems);
    expect(items.map((i) => [i.providerId, i.deleted])).toEqual([
      [radarrProviderId, true],
      [radarrProviderId, false],
      [radarr4kProviderId, false],
    ]);
  });

  it('moves series once joined on a TVDB id of 0 into their own groups, once that group no longer holds the id', async () => {
    const db = getDb();
    // A group as migration 0036 leaves it: its zero id and borrowed ids cleared, both copies still in it.
    const [{ id: joined }] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'series', title: 'Unlisted A', year: 2020 })
      .returning({ id: mediaIdentity.id });
    for (const externalId of [1, 2]) {
      await db
        .insert(mediaItems)
        .values({ providerId: sonarrProviderId, externalId, mediaIdentityId: joined });
    }
    const unlisted = (id: number, title: string, year: number) =>
      makeSeries({
        id,
        title,
        year,
        tvdbId: 0,
        tmdbId: undefined,
        imdbId: undefined,
        tvMazeId: undefined,
      });
    const sonarrProvider = {
      getSeries: vi
        .fn()
        .mockResolvedValue([unlisted(1, 'Unlisted A', 2020), unlisted(2, 'Unlisted B', 2021)]),
    };

    await new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrProvider }],
    }).runForSeries();

    const identities = await db.select().from(mediaIdentity);
    expect(identities.map((i) => i.title).sort()).toEqual(['Unlisted A', 'Unlisted B']);
    const items = await db.select().from(mediaItems);
    expect(new Set(items.map((i) => i.mediaIdentityId)).size).toBe(2);
  });

  it('upserts a Sonarr series into media_identity (contentType=series) and a media_item copy for the instance', async () => {
    const db = getDb();
    const sonarrProvider = { getSeries: vi.fn().mockResolvedValue([makeSeries()]) };

    const job = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrProvider }],
    });
    await job.runForSeries();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    expect(identities[0].contentType).toBe('series');
    expect(identities[0].tvdbId).toBe(200);
    expect(identities[0].tmdbId).toBe(300);
    expect(identities[0].imdbId).toBe('tt0000002');
    expect(identities[0].tvMazeId).toBe(400);

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].providerId).toBe(sonarrProviderId);
    expect(items[0].externalId).toBe(10);
  });

  it('resolves series from every active Sonarr instance, never collapsing to one', async () => {
    const db = getDb();
    const sonarrA = {
      getSeries: vi.fn().mockResolvedValue([makeSeries({ id: 10, tvdbId: 200 })]),
    };
    const sonarrB = {
      getSeries: vi.fn().mockResolvedValue([makeSeries({ id: 10, tvdbId: 201 })]),
    };

    const job = new CatalogRefreshJob({
      db,
      seriesSources: [
        { providerId: sonarrProviderId, name: 'Instance', provider: sonarrA },
        { providerId: sonarr4kProviderId, name: 'Instance', provider: sonarrB },
      ],
    });
    await job.runForSeries();

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(2);
  });

  it('marks a media_item row no longer reported by its Sonarr instance deleted', async () => {
    const db = getDb();
    const sonarrA = {
      getSeries: vi
        .fn()
        .mockResolvedValue([
          makeSeries({ id: 10, tvdbId: 200 }),
          makeSeries({ id: 11, tvdbId: 201 }),
        ]),
    };
    const job = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrA }],
    });
    await job.runForSeries();
    expect(await db.select().from(mediaItems)).toHaveLength(2);

    const sonarrAEmpty = {
      getSeries: vi.fn().mockResolvedValue([makeSeries({ id: 11, tvdbId: 201 })]),
    };
    const job2 = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrAEmpty }],
    });
    await job2.runForSeries();

    const items = await db.select().from(mediaItems);
    expect(items.map((i) => i.deleted)).toEqual([true, false]);
    expect(await db.select().from(mediaIdentity)).toHaveLength(2);
  });

  it("stamps a series identity from a Plex item of type 'show'", async () => {
    const db = getDb();
    const [seriesGroup] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'series', tvdbId: 81189 })
      .returning();

    const plexProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([
          { ratingKey: 'plex-series', type: 'show' as const, Guid: [{ id: 'tvdb://81189' }] },
        ]),
    };

    const job = new CatalogRefreshJob({
      db,
      plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
    });
    await job.runForPlex();

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.id, seriesGroup.id));
    expect(row.plexRatingKey).toBe('plex-series');
  });

  it('scopes the Plex stamp by content type — a movie tmdbId match never stamps a show group with the same numeric id', async () => {
    const db = getDb();
    const [movieGroup] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'movie', tmdbId: 603 })
      .returning();
    const [showGroup] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'series', tmdbId: 603 })
      .returning();

    const plexProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([
          { ratingKey: 'plex-movie', type: 'movie' as const, Guid: [{ id: 'tmdb://603' }] },
        ]),
    };

    const job = new CatalogRefreshJob({
      db,
      plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
    });
    await job.runForPlex();

    const [movieRow] = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.id, movieGroup.id));
    const [showRow] = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.id, showGroup.id));
    expect(movieRow.plexRatingKey).toBe('plex-movie');
    expect(showRow.plexRatingKey).toBeNull();
  });

  it('waits 500ms between consecutive TVMaze lookups', async () => {
    const db = getDb();
    const sonarrProvider = {
      getSeries: vi.fn().mockResolvedValue([
        makeSeries({ id: 10, tvdbId: 200, tvMazeId: undefined }),
        makeSeries({ id: 11, tvdbId: 201, tvMazeId: undefined }),
        makeSeries({ id: 12, tvdbId: 202, tvMazeId: 500 }), // already has tvMazeId — no delay
      ]),
    };
    const tvMazeLookup = { lookupByTvdbId: vi.fn().mockResolvedValue({ id: 999 }) };
    const delay = vi.fn().mockResolvedValue(undefined);

    const job = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrProvider }],
      tvMazeLookup,
      delay,
    });
    await job.runForSeries();

    // delay called once: between first and second lookup (not before first, not for the series with tvMazeId)
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledWith(500);
  });

  it('fetches tvMazeId via TVMaze lookup when series has no tvMazeId', async () => {
    const db = getDb();
    const sonarrProvider = {
      getSeries: vi.fn().mockResolvedValue([makeSeries({ tvMazeId: undefined })]),
    };
    const tvMazeLookup = {
      lookupByTvdbId: vi.fn().mockResolvedValue({ id: 999 }),
    };

    const job = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrProvider }],
      tvMazeLookup,
    });
    await job.runForSeries();

    const rows = await db.select().from(mediaIdentity);
    expect(rows).toHaveLength(1);
    expect(rows[0].tvMazeId).toBe(999);
  });

  it('runForMovies returns the total number of movies upserted across instances', async () => {
    const db = getDb();
    const radarrProvider = {
      getMovies: vi
        .fn()
        .mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 }), makeMovie({ id: 2, tmdbId: 200 })]),
    };

    const job = new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarrProvider }],
    });

    expect(await job.runForMovies()).toBe(2);
  });

  it('runForMovies returns 0 when no Radarr instance is configured', async () => {
    const db = getDb();
    const job = new CatalogRefreshJob({ db });

    expect(await job.runForMovies()).toBe(0);
  });

  it('runForSeries returns the total number of series upserted across instances', async () => {
    const db = getDb();
    const sonarrProvider = {
      getSeries: vi
        .fn()
        .mockResolvedValue([
          makeSeries({ id: 10, tvdbId: 200 }),
          makeSeries({ id: 11, tvdbId: 201 }),
        ]),
    };

    const job = new CatalogRefreshJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, name: 'Instance', provider: sonarrProvider }],
    });

    expect(await job.runForSeries()).toBe(2);
  });

  it('runForSeries returns 0 when no Sonarr instance is configured', async () => {
    const db = getDb();
    const job = new CatalogRefreshJob({ db });

    expect(await job.runForSeries()).toBe(0);
  });

  it('is idempotent — re-running with same movies does not duplicate rows', async () => {
    const db = getDb();
    const radarrProvider = { getMovies: vi.fn().mockResolvedValue([makeMovie()]) };

    const job = new CatalogRefreshJob({
      db,
      movieSources: [{ providerId: radarrProviderId, name: 'Instance', provider: radarrProvider }],
    });
    await job.runForMovies();
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
  });

  describe("against a real Plex server's responses", () => {
    const PLEX_URL = 'http://plex.fixture:32400';
    const fixture = (name: string) =>
      JSON.parse(
        readFileSync(path.join(__dirname, '../../../../tests/fixtures/plex', name), 'utf-8')
      );

    /** Serves the captured responses exactly as the server sent them, Guid only when asked for. */
    function serveCapturedPlex(): void {
      const sections = fixture('library-sections.json');
      server.use(
        http.get(`${PLEX_URL}/library/sections`, () => HttpResponse.json(sections)),
        http.get(`${PLEX_URL}/library/sections/:key/all`, ({ params, request }) => {
          const section = sections.MediaContainer.Directory.find(
            (d: { key: string }) => d.key === params.key
          );
          const withGuids = new URL(request.url).searchParams.get('includeGuids') === '1';
          return HttpResponse.json(
            fixture(`section-${section.type}-all${withGuids ? '-includeGuids' : ''}.json`)
          );
        })
      );
    }

    it('links a Radarr movie to its Plex item by TMDB id, and a Sonarr series by TVDB id', async () => {
      serveCapturedPlex();
      const db = getDb();
      await db.insert(mediaIdentity).values({ contentType: 'movie', tmdbId: 584 }); // 2 Fast 2 Furious
      await db.insert(mediaIdentity).values({ contentType: 'series', tvdbId: 396390 }); // 1883
      const plexProvider = new PlexProvider(
        { name: 'Plex', url: PLEX_URL, apiKey: 'token', settings: {} },
        getChildLogger('test')
      );

      await new CatalogRefreshJob({
        db,
        plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
      }).runForPlex();

      const movie = await db
        .select()
        .from(mediaIdentity)
        .where(eq(mediaIdentity.contentType, 'movie'));
      const series = await db
        .select()
        .from(mediaIdentity)
        .where(eq(mediaIdentity.contentType, 'series'));
      expect(movie[0].plexRatingKey).toBe('408');
      expect(series[0].plexRatingKey).toBe('45669');
    });

    it('leaves a title already linked to the same Plex item untouched', async () => {
      serveCapturedPlex();
      const db = getDb();
      await db.insert(mediaIdentity).values({
        contentType: 'movie',
        tmdbId: 584,
        plexRatingKey: '408',
      });
      const plexProvider = new PlexProvider(
        { name: 'Plex', url: PLEX_URL, apiKey: 'token', settings: {} },
        getChildLogger('test')
      );

      const changed = await new CatalogRefreshJob({
        db,
        plexSource: { providerId: plexProviderId, name: 'Plex', provider: plexProvider },
      }).runForPlex();

      const [movie] = await db.select().from(mediaIdentity);
      expect(movie.plexRatingKey).toBe('408');
      expect(changed).toBe(0);
    });
  });
});
