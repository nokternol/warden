import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import type { RadarrMovie } from '@server/modules/providers/connections/radarrProvider';
import type { SonarrSeries } from '@server/modules/providers/connections/sonarrProvider';
import { IdentityResolutionJob } from '@server/modules/providers/identityResolutionJob';
import { eq } from 'drizzle-orm';
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

describe('IdentityResolutionJob', () => {
  let radarrProviderId: number;
  let radarr4kProviderId: number;
  let sonarrProviderId: number;
  let sonarr4kProviderId: number;

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
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('sets plexRatingKey on media_identity rows where a Plex guid matches by tmdbId', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 100 });

    const plexProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ ratingKey: 'plex-key-42', guids: [{ id: 'tmdb://100' }] }]),
    };

    const job = new IdentityResolutionJob({ db, plexProvider });
    await job.runForPlex();

    const rows = await db.select().from(mediaIdentity);
    expect(rows[0].plexRatingKey).toBe('plex-key-42');
  });

  it('runForJellyfin sets jellyfinItemId where a Jellyfin ProviderIds.Tmdb matches, kind-scoped', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 100 });
    await db.insert(mediaIdentity).values({ kind: 'show', tmdbId: 100 });

    const jellyfinProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ Id: 'jf-42', Type: 'Movie', ProviderIds: { Tmdb: '100' } }]),
    };

    const job = new IdentityResolutionJob({ db, jellyfinProvider });
    await job.runForJellyfin();

    const movies = await db.select().from(mediaIdentity).where(eq(mediaIdentity.kind, 'movie'));
    expect(movies[0].jellyfinItemId).toBe('jf-42');
    const shows = await db.select().from(mediaIdentity).where(eq(mediaIdentity.kind, 'show'));
    expect(shows[0].jellyfinItemId).toBeNull();
  });

  it('runForJellyfin matches a series by ProviderIds.Tvdb', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'show', tvdbId: 200 });

    const jellyfinProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([{ Id: 'jf-show', Type: 'Series', ProviderIds: { Tvdb: '200' } }]),
    };

    const job = new IdentityResolutionJob({ db, jellyfinProvider });
    await job.runForJellyfin();

    const rows = await db.select().from(mediaIdentity);
    expect(rows[0].jellyfinItemId).toBe('jf-show');
  });

  it('runForJellyfin returns 0 without a Jellyfin provider and counts rows actually changed', async () => {
    const db = getDb();
    expect(await new IdentityResolutionJob({ db }).runForJellyfin()).toBe(0);

    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 100 });
    const jellyfinProvider = {
      getAllItems: vi.fn().mockResolvedValue([
        { Id: 'jf-hit', Type: 'Movie', ProviderIds: { Tmdb: '100' } },
        { Id: 'jf-miss', Type: 'Movie', ProviderIds: { Tmdb: '999' } },
        { Id: 'jf-no-ids', Type: 'Movie' },
      ]),
    };

    const job = new IdentityResolutionJob({ db, jellyfinProvider });
    expect(await job.runForJellyfin()).toBe(1);
  });

  it('runForPlex counts rows actually changed, not Plex items processed', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 100 });

    const plexProvider = {
      getAllItems: vi.fn().mockResolvedValue([
        { ratingKey: 'plex-match', guids: [{ id: 'tmdb://100' }] }, // updates 1 row
        { ratingKey: 'plex-miss', guids: [{ id: 'tmdb://999' }] }, // matches no row
      ]),
    };

    const job = new IdentityResolutionJob({ db, plexProvider });

    expect(await job.runForPlex()).toBe(1);
  });

  it('upserts a Radarr movie into media_identity (kind=movie) and a media_item copy for the instance', async () => {
    const db = getDb();
    const radarrProvider = { getMovies: vi.fn().mockResolvedValue([makeMovie()]) };

    const job = new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: radarrProviderId, provider: radarrProvider }],
    });
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    expect(identities[0].kind).toBe('movie');
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

    const job = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrA },
        { providerId: radarr4kProviderId, provider: radarrB },
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

    const job = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrA },
        { providerId: radarr4kProviderId, provider: radarrB },
      ],
    });
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.mediaIdentityId === identities[0].id)).toBe(true);
  });

  it('prunes a media_item row no longer reported by its instance without touching other instances', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 2, tmdbId: 200 })]) };
    const job = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrA },
        { providerId: radarr4kProviderId, provider: radarrB },
      ],
    });
    await job.runForMovies();

    // Movie 1 is removed from instance A's library; instance B is untouched.
    const radarrANowEmpty = { getMovies: vi.fn().mockResolvedValue([]) };
    const job2 = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrANowEmpty },
        { providerId: radarr4kProviderId, provider: radarrB },
      ],
    });
    await job2.runForMovies();

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].providerId).toBe(radarr4kProviderId);
  });

  it('sweeps a group left with zero media_item rows after pruning', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 100 })]) };
    const job = new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: radarrProviderId, provider: radarrA }],
    });
    await job.runForMovies();
    expect(await db.select().from(mediaIdentity)).toHaveLength(1);

    const radarrAEmpty = { getMovies: vi.fn().mockResolvedValue([]) };
    const job2 = new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: radarrProviderId, provider: radarrAEmpty }],
    });
    await job2.runForMovies();

    expect(await db.select().from(mediaIdentity)).toHaveLength(0);
    expect(await db.select().from(mediaItems)).toHaveLength(0);
  });

  it('does not sweep a group still held by another instance after one instance prunes its copy', async () => {
    const db = getDb();
    const radarrA = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 603 })]) };
    const radarrB = { getMovies: vi.fn().mockResolvedValue([makeMovie({ id: 1, tmdbId: 603 })]) };
    const job = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrA },
        { providerId: radarr4kProviderId, provider: radarrB },
      ],
    });
    await job.runForMovies();

    const radarrAEmpty = { getMovies: vi.fn().mockResolvedValue([]) };
    const job2 = new IdentityResolutionJob({
      db,
      movieSources: [
        { providerId: radarrProviderId, provider: radarrAEmpty },
        { providerId: radarr4kProviderId, provider: radarrB },
      ],
    });
    await job2.runForMovies();

    expect(await db.select().from(mediaIdentity)).toHaveLength(1);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].providerId).toBe(radarr4kProviderId);
  });

  it('upserts a Sonarr series into media_identity (kind=show) and a media_item copy for the instance', async () => {
    const db = getDb();
    const sonarrProvider = { getSeries: vi.fn().mockResolvedValue([makeSeries()]) };

    const job = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrProvider }],
    });
    await job.runForSeries();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    expect(identities[0].kind).toBe('show');
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

    const job = new IdentityResolutionJob({
      db,
      seriesSources: [
        { providerId: sonarrProviderId, provider: sonarrA },
        { providerId: sonarr4kProviderId, provider: sonarrB },
      ],
    });
    await job.runForSeries();

    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(2);
  });

  it('prunes a media_item row no longer reported by its Sonarr instance', async () => {
    const db = getDb();
    const sonarrA = {
      getSeries: vi.fn().mockResolvedValue([makeSeries({ id: 10, tvdbId: 200 })]),
    };
    const job = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrA }],
    });
    await job.runForSeries();
    expect(await db.select().from(mediaItems)).toHaveLength(1);

    const sonarrAEmpty = { getSeries: vi.fn().mockResolvedValue([]) };
    const job2 = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrAEmpty }],
    });
    await job2.runForSeries();

    expect(await db.select().from(mediaItems)).toHaveLength(0);
    expect(await db.select().from(mediaIdentity)).toHaveLength(0);
  });

  it('scopes the Plex stamp by kind — a movie tmdbId match never stamps a show group with the same numeric id', async () => {
    const db = getDb();
    const [movieGroup] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 603 })
      .returning();
    const [showGroup] = await db
      .insert(mediaIdentity)
      .values({ kind: 'show', tmdbId: 603 })
      .returning();

    const plexProvider = {
      getAllItems: vi
        .fn()
        .mockResolvedValue([
          { ratingKey: 'plex-movie', type: 'movie' as const, guids: [{ id: 'tmdb://603' }] },
        ]),
    };

    const job = new IdentityResolutionJob({ db, plexProvider });
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

    const job = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrProvider }],
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

    const job = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrProvider }],
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

    const job = new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: radarrProviderId, provider: radarrProvider }],
    });

    expect(await job.runForMovies()).toBe(2);
  });

  it('runForMovies returns 0 when no Radarr instance is configured', async () => {
    const db = getDb();
    const job = new IdentityResolutionJob({ db });

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

    const job = new IdentityResolutionJob({
      db,
      seriesSources: [{ providerId: sonarrProviderId, provider: sonarrProvider }],
    });

    expect(await job.runForSeries()).toBe(2);
  });

  it('runForSeries returns 0 when no Sonarr instance is configured', async () => {
    const db = getDb();
    const job = new IdentityResolutionJob({ db });

    expect(await job.runForSeries()).toBe(0);
  });

  it('is idempotent — re-running with same movies does not duplicate rows', async () => {
    const db = getDb();
    const radarrProvider = { getMovies: vi.fn().mockResolvedValue([makeMovie()]) };

    const job = new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: radarrProviderId, provider: radarrProvider }],
    });
    await job.runForMovies();
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
  });
});
