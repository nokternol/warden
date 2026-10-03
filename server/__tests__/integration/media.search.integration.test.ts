import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createSearchProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/search/metadata', () => {
  let app: Express;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ media: createSearchProcedures(container.cradle) }));
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('answers an empty result list when no searchable provider is active', async () => {
    const res = await request(app).get('/api/search/metadata?title=Matrix');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', data: [] });
  });
});
