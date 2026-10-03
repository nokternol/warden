import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { type AppConfig, loadConfig } from '@server/kernel/config';
import { type DrizzleDb, closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/providers/ratings — TMDB key DI isolation', () => {
  let db: DrizzleDb;
  let baseConfig: AppConfig;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    baseConfig = loadConfig();
    db = await initializeDatabase(baseConfig);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  function buildAppWithTmdbKey(tmdbApiKey: string) {
    // Build a container whose config has a DIFFERENT TMDB key than the module singleton.
    // The handler must use this injected key, not getConfig().TMDB_API_KEY.
    const config = { ...baseConfig, TMDB_API_KEY: tmdbApiKey };
    const container = buildContainer({ config, db });

    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(serveApi({ providers: createProvidersProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);
    return app;
  }

  it('uses config.TMDB_API_KEY injected through the cradle, not the module singleton', async () => {
    let capturedApiKey: string | null = null;

    server.use(
      http.get('https://api.themoviedb.org/3/search/multi', ({ request }) => {
        capturedApiKey = new URL(request.url).searchParams.get('api_key');
        return HttpResponse.json({ results: [] });
      }),
      http.get('https://api.tvmaze.com/search/shows', () => HttpResponse.json([]))
    );

    const client = createApiClient(buildAppWithTmdbKey('injected-test-key-xyz'));
    const response = await client.get('/api/providers/ratings?title=Inception&year=2010');
    expectSuccessResponse(response);

    expect(capturedApiKey).toBe('injected-test-key-xyz');
  });

  it('does not call TMDB when config.TMDB_API_KEY is empty', async () => {
    let tmdbCalled = false;

    server.use(
      http.get('https://api.themoviedb.org/3/search/multi', () => {
        tmdbCalled = true;
        return HttpResponse.json({ results: [] });
      }),
      http.get('https://api.tvmaze.com/search/shows', () => HttpResponse.json([]))
    );

    const client = createApiClient(buildAppWithTmdbKey(''));
    const response = await client.get('/api/providers/ratings?title=Inception&year=2010');
    expectSuccessResponse(response);

    expect(tmdbCalled).toBe(false);
  });
});
