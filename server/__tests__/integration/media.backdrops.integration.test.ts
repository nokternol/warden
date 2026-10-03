import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createBackdropsProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/backdrops', () => {
  let app: Express;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    // No signed-in user: the login page reads backdrops before sign-in.
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(serveApi({ media: createBackdropsProcedures(container.cradle) }));
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("answers TMDB's trending backdrops as full image URLs without a signed-in user", async () => {
    server.use(
      http.get('https://api.themoviedb.org/3/trending/all/week', () =>
        HttpResponse.json({
          results: [
            { media_type: 'movie', backdrop_path: '/matrix.jpg' },
            { media_type: 'person', backdrop_path: '/actor.jpg' },
          ],
        })
      )
    );

    const res = await request(app).get('/api/backdrops');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: ['https://image.tmdb.org/t/p/original/matrix.jpg'],
    });
  });
});
