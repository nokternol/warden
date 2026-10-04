import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Paginated Media API integration tests.
 *
 * Covers the paginated /api/media/movie and /api/media/series browse endpoints.
 * MSW intercepts Radarr/Sonarr HTTP calls; per-test overrides supply
 * a larger dataset for meaningful pagination assertions.
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
import {
  browsePath,
  createApiClient,
  expectErrorResponse,
  expectSuccessResponse,
} from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMovies(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Movie ${i + 1}`,
    hasFile: i % 2 === 0,
    monitored: true,
    tmdbId: 1000 + i,
    profileId: 1,
    qualityProfileId: 1,
    tags: [],
    folderName: `/movies/Movie${i + 1}`,
    path: `/movies/Movie${i + 1}`,
  }));
}

const mockUser = {
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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Paginated Media API', () => {
  let authedApp: Express;
  let unauthedApp: Express;
  let authedClient: ReturnType<typeof createApiClient>;
  let unauthedClient: ReturnType<typeof createApiClient>;
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;
    const { providerSettingsService } = cradle;

    await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
    await providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'fake-key',
    });

    const mediaRoutes = serveApi({ media: createMediaProcedures(cradle).procedures });

    authedApp = express();
    authedApp.use(express.json());
    authedApp.use(requestIdMiddleware);
    authedApp.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = mockUser;
      next();
    });
    authedApp.use('/api/media', mediaRoutes);
    authedApp.use(errorHandlerMiddleware);

    unauthedApp = express();
    unauthedApp.use(express.json());
    unauthedApp.use(requestIdMiddleware);
    unauthedApp.use('/api/media', mediaRoutes);
    unauthedApp.use(errorHandlerMiddleware);

    authedClient = createApiClient(authedApp);
    unauthedClient = createApiClient(unauthedApp);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Override Radarr to return 5 movies before each test so the cache is
  // populated with predictable data. vitest.server.ts resets handlers in
  // afterEach, so we re-apply here.
  beforeEach(() => {
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(makeMovies(5)))
    );
  });

  // ─── /api/media/movie ───────────────────────────────────────────────────────

  describe('GET /api/media/movie', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await unauthedClient.get(browsePath('movie'));
      expectErrorResponse(res, 401);
    });

    it('returns paginated result shape', async () => {
      const res = await authedClient.get(browsePath('movie', [], { page: 1, pageSize: 2 }));
      const data = expectSuccessResponse(res);

      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('totalCount');
      expect(data).toHaveProperty('page', 1);
      expect(data).toHaveProperty('pageSize', 2);
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('returns first page correctly', async () => {
      const res = await authedClient.get(browsePath('movie', [], { page: 1, pageSize: 2 }));
      const data = expectSuccessResponse(res);

      expect(data.items).toHaveLength(2);
      expect(data.totalCount).toBe(5);
      expect(data.items[0]).toMatchObject({ title: 'Movie 1' });
      expect(data.items[1]).toMatchObject({ title: 'Movie 2' });
    });

    it('returns second page correctly', async () => {
      const res = await authedClient.get(browsePath('movie', [], { page: 2, pageSize: 2 }));
      const data = expectSuccessResponse(res);

      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toMatchObject({ title: 'Movie 3' });
      expect(data.items[1]).toMatchObject({ title: 'Movie 4' });
    });

    it('returns last partial page', async () => {
      const res = await authedClient.get(browsePath('movie', [], { page: 3, pageSize: 2 }));
      const data = expectSuccessResponse(res);

      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toMatchObject({ title: 'Movie 5' });
      expect(data.totalCount).toBe(5);
    });

    it('returns empty items for out-of-range page', async () => {
      const res = await authedClient.get(browsePath('movie', [], { page: 99, pageSize: 2 }));
      const data = expectSuccessResponse(res);

      expect(data.items).toHaveLength(0);
      expect(data.totalCount).toBe(5);
    });

    it('defaults to page=1 and pageSize=48 when params are absent', async () => {
      const res = await authedClient.get(browsePath('movie'));
      const data = expectSuccessResponse(res);

      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(48);
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  // ─── /api/media/series ──────────────────────────────────────────────────────

  describe('GET /api/media/series', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await unauthedClient.get(browsePath('series'));
      expectErrorResponse(res, 401);
    });

    it('returns paginated result shape', async () => {
      const res = await authedClient.get(browsePath('series', [], { page: 1, pageSize: 48 }));
      const data = expectSuccessResponse(res);

      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('totalCount');
      expect(data).toHaveProperty('page', 1);
      expect(data).toHaveProperty('pageSize', 48);
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('returns series items from provider', async () => {
      const res = await authedClient.get(browsePath('series', [], { page: 1, pageSize: 48 }));
      const data = expectSuccessResponse(res);

      expect(data.items[0]).toMatchObject({ title: 'Breaking Bad' });
      expect(data.totalCount).toBe(1);
    });

    it('defaults to page=1 and pageSize=48 when params are absent', async () => {
      const res = await authedClient.get(browsePath('series'));
      const data = expectSuccessResponse(res);

      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(48);
    });
  });

  // ─── provider error propagation ─────────────────────────────────────────────
  //
  // Each test creates a fresh serveApi({ media: createMediaProcedures(cradle).procedures }) so the cache is cold
  // and the per-test MSW override is the sole source of truth for that request.
  //
  describe('provider error propagation', () => {
    function buildErrorClient(
      routes: ReturnType<typeof serveApi>
    ): ReturnType<typeof createApiClient> {
      const app = express();
      app.use(express.json());
      app.use(requestIdMiddleware);
      app.use((_req: Request, _res: Response, next: NextFunction) => {
        _req.user = mockUser;
        next();
      });
      app.use('/api/media', routes);
      app.use(errorHandlerMiddleware);
      return createApiClient(app);
    }

    it('GET /api/media/movie includes errors when Radarr returns 500', async () => {
      server.use(
        http.get(
          'http://localhost:7878/api/v3/movie',
          () => new HttpResponse(null, { status: 500 })
        )
      );

      const client = buildErrorClient(
        serveApi({ media: createMediaProcedures(cradle).procedures })
      );
      const res = await client.get(browsePath('movie'));
      const data = expectSuccessResponse(res);

      expect(data.items).toEqual([]);
      expect(data.totalCount).toBe(0);
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0]).toMatchObject({ provider: 'Radarr' });
    });

    it('GET /api/media/series includes errors when Sonarr returns 500', async () => {
      server.use(
        http.get(
          'http://localhost:8989/api/v3/series',
          () => new HttpResponse(null, { status: 500 })
        )
      );

      const client = buildErrorClient(
        serveApi({ media: createMediaProcedures(cradle).procedures })
      );
      const res = await client.get(browsePath('series'));
      const data = expectSuccessResponse(res);

      expect(data.items).toEqual([]);
      expect(data.totalCount).toBe(0);
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0]).toMatchObject({ provider: 'Sonarr' });
    });

    it('GET /api/media/movie has errors: [] when Radarr is healthy', async () => {
      server.use(
        http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(makeMovies(2)))
      );

      const client = buildErrorClient(
        serveApi({ media: createMediaProcedures(cradle).procedures })
      );
      const res = await client.get(browsePath('movie'));
      const data = expectSuccessResponse(res);

      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors).toEqual([]);
    });

    it('GET /api/media/series has errors: [] when Sonarr is healthy', async () => {
      server.use(
        http.get('http://localhost:8989/api/v3/series', () =>
          HttpResponse.json([
            {
              id: 1,
              title: 'Breaking Bad',
              status: 'ended',
              monitored: true,
              tvdbId: 81189,
              qualityProfileId: 1,
              tags: [],
              path: '/tv/Breaking Bad',
            },
          ])
        )
      );

      const client = buildErrorClient(
        serveApi({ media: createMediaProcedures(cradle).procedures })
      );
      const res = await client.get(browsePath('series'));
      const data = expectSuccessResponse(res);

      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors).toEqual([]);
    });
  });
});
