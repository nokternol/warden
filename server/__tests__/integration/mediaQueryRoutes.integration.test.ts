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

  it('accepts and round-trips an instance-scoped filter value', async () => {
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
        filters: [{ ruleKey: 'qualityProfileIds', value: { providerId: provider.id, ids: [5] } }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.filters[0].value).toEqual({ providerId: provider.id, ids: [5] });
  });

  it('answers 409 with the reason when an automation uses the query being deleted', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({
        type: MetadataProviderType.RADARR,
        name: 'Radarr',
        url: 'http://radarr',
        settings: JSON.stringify({ enabledTasks: ['unmonitorMovie'] }),
      })
      .returning();
    const query = await supertest(app)
      .post('/api/media-queries')
      .send({ name: 'Q', contentType: 'movie', filters: [] });
    await supertest(app)
      .post('/api/automations')
      .send({
        name: 'A',
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 2 * * *',
        queryId: query.body.data.id,
      })
      .expect(200);

    const res = await supertest(app).delete(`/api/media-queries/${query.body.data.id}`);

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('used by an automation');
  });
});
