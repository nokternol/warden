import { MetadataProviderType, mediaItems, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { LibraryCache, reporterReliability } from '@server/modules/media/libraryCache';
import { getRule } from '@server/modules/media/ruleRegistry';
import type { RefreshKind, StoredRefreshRecord } from '@server/modules/providers';
import { CatalogRefreshJob } from '@server/modules/providers/catalogRefreshJob';
import { createRadarrMovie } from '@tests/factories';
import { emptyCatalogRun } from '@tests/helpers/collaborators';
import { seedFacts } from '@tests/helpers/library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

describe('LibraryCache', () => {
  let radarrId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    [{ id: radarrId }] = await getDb()
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  async function refresh(titles: string[]) {
    await new CatalogRefreshJob({
      ...emptyCatalogRun(),
      db: getDb(),
      movieSources: [
        {
          providerId: radarrId,
          name: 'Radarr',
          provider: {
            getMovies: async () =>
              titles.map((title, i) => createRadarrMovie({ id: i + 1, title, tmdbId: 100 + i })),
          },
        },
      ],
    }).runForMovies();
  }

  it('answers the next read from the new copy when a refresh lands during a load', async () => {
    const eventBus = new DomainEventBus();
    const cache = new LibraryCache({ db: getDb(), eventBus });
    await refresh(['Heat']);

    const inFlight = cache.read();
    await refresh(['Heat', 'Ronin']);
    eventBus.emit('media:changed', {});
    await inFlight;

    const { copies } = await cache.read();
    expect(copies.movie.map((c) => c.record.title).sort()).toEqual(['Heat', 'Ronin']);
  });

  it('picks one value per contested fact by precedence when it loads, keeping uncontested facts', async () => {
    const [{ id: tautulliId }, { id: plexId }, { id: jellyfinId }] = await getDb()
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p' },
        { type: MetadataProviderType.JELLYFIN, name: 'Jellyfin', url: 'http://j' },
      ])
      .returning({ id: metadataProviders.id });
    await refresh(['Heat']);
    const [copy] = await getDb().select().from(mediaItems);
    const title = copy.mediaIdentityId;
    // Tautulli's row is stored first, then Plex's, then Jellyfin's.
    await seedFacts(
      getDb(),
      title,
      { playCount: 5, lastWatchedAt: '2024-01-01T00:00:00.000Z' },
      tautulliId
    );
    await seedFacts(
      getDb(),
      title,
      {
        playCount: 2,
        studio: 'Plex Studio',
        videoCodec: 'h264',
        addedToMediaServerAt: '2023-01-01T00:00:00.000Z',
      },
      plexId
    );
    await seedFacts(
      getDb(),
      title,
      { playCount: 9, studio: 'Jellyfin Studio', videoCodec: 'hevc', isFavorite: true },
      jellyfinId
    );

    const { copies } = await new LibraryCache({
      db: getDb(),
      eventBus: new DomainEventBus(),
    }).read();

    expect(copies.movie[0].item).toMatchObject({
      playCount: 5,
      lastWatchedAt: '2024-01-01T00:00:00.000Z',
      studio: 'Plex Studio',
      videoCodec: 'h264',
      addedToMediaServerAt: '2023-01-01T00:00:00.000Z',
      isFavorite: true,
    });
  });

  it('keeps Plex studio and codec for a title Tautulli and Plex both track', async () => {
    const [{ id: tautulliId }, { id: plexId }] = await getDb()
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p' },
      ])
      .returning({ id: metadataProviders.id });
    await refresh(['Heat']);
    const [copy] = await getDb().select().from(mediaItems);
    await seedFacts(getDb(), copy.mediaIdentityId, { playCount: 5 }, tautulliId);
    await seedFacts(
      getDb(),
      copy.mediaIdentityId,
      { playCount: 2, studio: 'Legendary', videoCodec: 'hevc' },
      plexId
    );

    const { copies } = await new LibraryCache({
      db: getDb(),
      eventBus: new DomainEventBus(),
    }).read();

    expect(copies.movie[0].item).toMatchObject({
      playCount: 5,
      studio: 'Legendary',
      videoCodec: 'hevc',
    });
  });
});

describe('reporterReliability', () => {
  const { PLEX, JELLYFIN, TAUTULLI, SEERR } = MetadataProviderType;
  const providers = [
    { id: 1, name: 'Plex', type: PLEX },
    { id: 2, name: 'Jellyfin', type: JELLYFIN },
    { id: 3, name: 'Tautulli', type: TAUTULLI },
    { id: 4, name: 'Seerr', type: SEERR },
  ];
  const record = (providerId: number, kind: RefreshKind, failed = false): StoredRefreshRecord => ({
    providerId,
    kind,
    refreshedAt: 1,
    failedAt: failed ? 2 : null,
    error: failed ? 'down' : null,
  });

  it('answers, per active reporter of a fact, the refresh it cannot be relied on for, or none', () => {
    const library = {
      providers,
      records: [
        record(1, 'facts'),
        record(1, 'links', true),
        record(2, 'facts', true),
        record(2, 'links'),
        record(3, 'facts'),
        record(4, 'facts'),
      ],
    };

    expect(reporterReliability(library, getRule('watched', 'movie')!, 'movie')).toEqual([
      { providerId: 1, unrefreshed: { providerId: 1, kind: 'links' } },
      { providerId: 2, unrefreshed: { providerId: 2, kind: 'facts' } },
      { providerId: 3, unrefreshed: { providerId: 1, kind: 'links' } },
    ]);
    expect(reporterReliability(library, getRule('requestStatus', 'movie')!, 'movie')).toEqual([
      { providerId: 4, unrefreshed: null },
    ]);
  });

  it('relies on a reporter whose media server is not active, and on one that never needs links', () => {
    const library = { providers: [providers[2]], records: [record(3, 'facts')] };

    expect(reporterReliability(library, getRule('watched', 'movie')!, 'movie')).toEqual([
      { providerId: 3, unrefreshed: null },
    ]);
  });
});
