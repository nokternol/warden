import { MetadataProviderType, mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { EnrichmentJobFactory } from '@server/modules/media/enrichmentJobFactory';
import { ProviderFactory, ProviderSettingsService } from '@server/modules/providers';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const TAUTULLI_URL = 'http://localhost:8181';

function makeFactory(): EnrichmentJobFactory {
  const db = getDb();
  return new EnrichmentJobFactory({
    db,
    enrichmentQueries: new EnrichmentQueries({ db }),
    providerSettingsService: new ProviderSettingsService({ db }),
    providerFactory: new ProviderFactory(),
  });
}

describe('EnrichmentJobFactory', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  it('wires the active Tautulli provider so the job persists play counts', async () => {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    await providerSettingsService.create({
      type: MetadataProviderType.TAUTULLI,
      name: 'Test Tautulli',
      url: TAUTULLI_URL,
      apiKey: 'tautulli-key',
    });
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 603, plexRatingKey: '1', resolvedAt: 0 })
      .returning();
    server.use(
      http.get(`${TAUTULLI_URL}/api/v2`, () =>
        HttpResponse.json({
          response: {
            result: 'success',
            data: { data: [{ rating_key: '1', played_at: 1000 }], total_count: 1 },
          },
        })
      )
    );

    const job = await makeFactory().create();
    await job.run();

    const fields = await new EnrichmentQueries({ db }).getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.playCount).toBe(1);
  });

  it('wires the active Jellyfin provider so the job persists isFavorite', async () => {
    const JELLYFIN_URL = 'http://localhost:8096';
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    await providerSettingsService.create({
      type: MetadataProviderType.JELLYFIN,
      name: 'Test Jellyfin',
      url: JELLYFIN_URL,
      apiKey: 'jellyfin-key',
      settings: { userId: 'test-user-id' },
    });
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 603, jellyfinItemId: 'jf-1', resolvedAt: 0 })
      .returning();
    server.use(
      http.get(`${JELLYFIN_URL}/Users/:userId/Items`, () =>
        HttpResponse.json({
          Items: [{ Id: 'jf-1', Name: 'M', Type: 'Movie', UserData: { IsFavorite: true } }],
          TotalRecordCount: 1,
        })
      )
    );

    const job = await makeFactory().create();
    await job.run();

    const fields = await new EnrichmentQueries({ db }).getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.isFavorite).toBe(true);
  });

  it('returns a runnable job when no enrichment providers are active', async () => {
    await getDb().insert(mediaIdentity).values({ kind: 'movie', tmdbId: 604, resolvedAt: 0 });

    const job = await makeFactory().create();

    await expect(job.run()).resolves.toBeTypeOf('number');
  });
});
