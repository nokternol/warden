import { MetadataProviderType, mediaItems, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { LibraryCache } from '@server/modules/media/libraryCache';
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
