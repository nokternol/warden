import { MetadataProviderType, mediaItems } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ProviderSettingsService } from '@server/modules/providers';
import { IdentityResolutionJob } from '@server/modules/providers/identityResolutionJob';
import { recordSourceCopy } from '@server/modules/providers/sourceCopy';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRadarrMovie } from '../../../../tests/factories';

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

describe('recordSourceCopy', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('answers with the copy the identity job recorded first', async () => {
    const db = getDb();
    const provider = await new ProviderSettingsService({ db }).create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'key',
      settings: {},
    });
    const movie = createRadarrMovie({ id: 5, tmdbId: 105, title: 'Heat', year: 1995 });
    await new IdentityResolutionJob({
      db,
      movieSources: [{ providerId: provider.id, provider: { getMovies: async () => [movie] } }],
    }).runForMovies();
    const [jobCopy] = await db.select({ id: mediaItems.id }).from(mediaItems);

    await expect(
      recordSourceCopy(db, {
        kind: 'movie',
        providerId: provider.id,
        externalId: movie.id,
        ids: { tmdbId: movie.tmdbId, title: movie.title, year: movie.year },
      })
    ).resolves.toBe(jobCopy.id);
  });
});
