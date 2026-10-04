import { buildContainer } from '@server/container';
import type { AppConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createApiRouter } from '@server/modules';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Providers have one HTTP home, `/api/providers`. The settings paths that
 * once served provider CRUD and connection testing are not served at all.
 */

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5095,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: true,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

const SETTINGS_PROVIDER_PATHS = [
  ['get', '/api/settings/providers'],
  ['post', '/api/settings/providers'],
  ['patch', '/api/settings/providers/1'],
  ['delete', '/api/settings/providers/1'],
  ['get', '/api/settings/providers/test'],
] as const;

describe('providers home', () => {
  let app: Express;

  beforeAll(async () => {
    const db = await initializeDatabase(testConfig);
    const container = buildContainer({ config: testConfig, db });
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api', createApiRouter(container.cradle));
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it.each(SETTINGS_PROVIDER_PATHS)('%s %s answers 404', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(404);
  });
});
