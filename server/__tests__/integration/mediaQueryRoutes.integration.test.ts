import { buildContainer } from '@server/container';
import { MetadataProviderType, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { createApiRouter } from '@server/modules';
import express from 'express';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('media query routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const container = buildContainer({ config: testConfig, db: getDb() });
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 1, email: 'test@example.com' } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use('/api', createApiRouter(container.cradle));
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('serves the list at the canonical /media-queries path', async () => {
    const res = await supertest(app).get('/api/media-queries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts and round-trips a providerId-qualified filter value entry', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning();

    const res = await supertest(app)
      .post('/api/media-queries')
      .send({
        name: 'Qualified',
        contentType: 'movie',
        filterValues: [{ key: 'qualityProfileIds', value: '5', providerId: provider.id }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.filterValues[0].providerId).toBe(provider.id);
  });
});
