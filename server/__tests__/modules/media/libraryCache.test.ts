import { MetadataProviderType, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { LibraryCache } from '@server/modules/media/libraryCache';
import { IdentityResolutionJob } from '@server/modules/providers/identityResolutionJob';
import { createRadarrMovie } from '@tests/factories';
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
    await new IdentityResolutionJob({
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
});
