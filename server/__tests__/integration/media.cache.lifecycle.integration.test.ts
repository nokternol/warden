import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Tests for observable cache lifecycle behaviour in MediaHandler.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const MOCK_USER = {
  id: 1,
  email: 'test@example.com',
  plexUsername: 'testuser',
  plexId: null,
  avatar: null,
  userType: 'plex' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildAuthedApp(routes: ReturnType<typeof serveApi>): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    _req.user = MOCK_USER;
    next();
  });
  app.use('/api/media', routes);
  app.use(errorHandlerMiddleware);
  return app;
}

function makeRadarrMovie(title: string, id = 1) {
  return {
    id,
    title,
    hasFile: true,
    monitored: true,
    tmdbId: 603,
    qualityProfileId: 1,
    tags: [],
    path: `/movies/${title}`,
  };
}

// --------------------------------------------------------------------------

describe('MediaHandler cache lifecycle', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;

    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'fake-key',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('two concurrent GET /api/media/movies requests coalesce into one Radarr call', async () => {
    let radarrCallCount = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/movie', async () => {
        radarrCallCount++;
        // artificial delay so the second request always arrives while the first is in-flight
        await new Promise((resolve) => setTimeout(resolve, 30));
        return HttpResponse.json([makeRadarrMovie('Inception')]);
      })
    );

    const routes = serveApi({ media: createMediaProcedures(cradle).procedures });
    const client = createApiClient(buildAuthedApp(routes));

    const [res1, res2] = await Promise.all([
      client.get('/api/media/movies'),
      client.get('/api/media/movies'),
    ]);

    expect(radarrCallCount).toBe(1);
    expect(expectSuccessResponse(res1).items).toHaveLength(1);
    expect(expectSuccessResponse(res2).items).toHaveLength(1);
  });

  it('two createMediaProcedures() instances have independent caches', async () => {
    // Arrange: each successive Radarr call returns a different film title so we
    // can detect whether handler B read from handler A's cache or fetched independently.
    let radarrCallCount = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => {
        radarrCallCount++;
        const title = radarrCallCount === 1 ? 'The Matrix' : 'Inception';
        return HttpResponse.json([makeRadarrMovie(title, radarrCallCount)]);
      })
    );

    const routesA = serveApi({ media: createMediaProcedures(cradle).procedures });
    const routesB = serveApi({ media: createMediaProcedures(cradle).procedures });
    const clientA = createApiClient(buildAuthedApp(routesA));
    const clientB = createApiClient(buildAuthedApp(routesB));

    const resA = await clientA.get('/api/media/movies');
    expect(expectSuccessResponse(resA).items[0].title).toBe('The Matrix');
    expect(radarrCallCount).toBe(1);

    // Handler B must NOT read from handler A's cache; it must do its own fetch.
    const resB = await clientB.get('/api/media/movies');
    expect(expectSuccessResponse(resB).items[0].title).toBe('Inception');
    expect(radarrCallCount).toBe(2);
  });
});
