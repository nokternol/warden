import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Radarr provider spec — dedicated lookup routes for the two new csv-strings
 * fields (releaseGroups, collectionName), following listNetworks/listGenres's
 * established shape: dedupe+sort over already-fetched Radarr movie data.
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PIN_MOVIES = [
  {
    id: 1,
    title: 'Alpha',
    year: 2001,
    hasFile: true,
    monitored: true,
    tmdbId: 101,
    qualityProfileId: 1,
    tags: [],
    path: '/movies/Alpha',
    statistics: { movieFileCount: 1, sizeOnDisk: 0, releaseGroups: ['SPARKS', 'RARBG'] },
    collection: { name: 'Alpha Collection', tmdbId: 9001 },
  },
  {
    id: 2,
    title: 'Bravo',
    year: 1995,
    hasFile: false,
    monitored: false,
    tmdbId: 102,
    qualityProfileId: 2,
    tags: [],
    path: '/movies/Bravo',
    statistics: { movieFileCount: 0, sizeOnDisk: 0, releaseGroups: ['SPARKS'] },
  },
  {
    id: 3,
    title: 'Charlie',
    year: 2010,
    hasFile: true,
    monitored: true,
    tmdbId: 103,
    qualityProfileId: 1,
    tags: [],
    path: '/movies/Charlie',
    statistics: { movieFileCount: 1, sizeOnDisk: 0, releaseGroups: [] },
    collection: { name: 'Alpha Collection', tmdbId: 9001 },
  },
];

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

describe('Media lookup routes — Radarr-sourced', () => {
  let client: ReturnType<typeof createApiClient>;

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
    const { providerSettingsService } = container.cradle;

    await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = mockUser;
      next();
    });
    app.use('/api/media', serveApi({ media: createMediaProcedures(container.cradle).procedures }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    server.use(http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(PIN_MOVIES)));
  });

  describe('GET /api/media/release-groups', () => {
    it('returns deduped, sorted release groups across every fetched movie', async () => {
      const res = await client.get('/api/media/release-groups');
      const data = expectSuccessResponse(res);
      expect(data).toEqual(['RARBG', 'SPARKS']);
    });
  });

  describe('GET /api/media/collection-names', () => {
    it('returns deduped, sorted collection names across every fetched movie', async () => {
      const res = await client.get('/api/media/collection-names');
      const data = expectSuccessResponse(res);
      expect(data).toEqual(['Alpha Collection']);
    });
  });
});
