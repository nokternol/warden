import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Phase 2 — browse path delegated to the canonical ruleRegistry.
 *
 * Covers predicates the browse Zod schema previously stripped (so they silently
 * did nothing) and the enriched predicates the parallel engine never declared.
 * Each predicate narrows the result through the single registry engine.
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
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const REG_MOVIES = [
  {
    id: 1,
    title: 'Rated PG13',
    year: 2001,
    hasFile: true,
    monitored: true,
    tmdbId: 1,
    qualityProfileId: 1,
    tags: [],
    genres: ['Action'],
    certification: 'PG-13',
    path: '/m/1',
  },
  {
    id: 2,
    title: 'Rated R',
    year: 2002,
    hasFile: true,
    monitored: true,
    tmdbId: 2,
    qualityProfileId: 1,
    tags: [],
    genres: ['Action'],
    certification: 'R',
    path: '/m/2',
  },
  {
    id: 3,
    title: 'Unrated',
    year: 2003,
    hasFile: true,
    monitored: true,
    tmdbId: 3,
    qualityProfileId: 1,
    tags: [],
    genres: ['Action'],
    path: '/m/3',
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

describe('Media browse — registry-delegated predicates', () => {
  let cradle: import('@server/container').Cradle;

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
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Fresh routes per call → isolated MediaCache, so each test owns its movie fixture.
  function clientWithMovies(movies: unknown[]): ReturnType<typeof createApiClient> {
    server.use(http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(movies)));
    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = mockUser;
      next();
    });
    app.use('/api/media', serveApi({ media: createMediaProcedures(cradle).procedures }));
    app.use(errorHandlerMiddleware);
    return createApiClient(app);
  }

  const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const GB = 1_073_741_824;

  describe('certification (previously stripped by the browse schema)', () => {
    it('returns only movies whose certification matches (case-insensitive)', async () => {
      const client = clientWithMovies(REG_MOVIES);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'certification', value: 'PG-13' }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Rated PG13']);
    });
  });

  // ─── Previously-stripped numeric predicates (restore the registry intent) ────

  describe('addedDaysAgoGte', () => {
    it('returns only movies added at least N days ago', async () => {
      const client = clientWithMovies([
        {
          id: 1,
          title: 'Old',
          year: 2001,
          hasFile: true,
          monitored: true,
          tmdbId: 1,
          qualityProfileId: 1,
          tags: [],
          genres: [],
          added: daysAgoIso(10),
          path: '/m/1',
        },
        {
          id: 2,
          title: 'New',
          year: 2002,
          hasFile: true,
          monitored: true,
          tmdbId: 2,
          qualityProfileId: 1,
          tags: [],
          genres: [],
          added: daysAgoIso(2),
          path: '/m/2',
        },
      ]);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'addedDaysAgo', value: { min: 7 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Old']);
    });

    it('returns only movies added at most N days ago', async () => {
      const client = clientWithMovies([
        {
          id: 1,
          title: 'Old',
          year: 2001,
          hasFile: true,
          monitored: true,
          tmdbId: 1,
          qualityProfileId: 1,
          tags: [],
          genres: [],
          added: daysAgoIso(10),
          path: '/m/1',
        },
        {
          id: 2,
          title: 'New',
          year: 2002,
          hasFile: true,
          monitored: true,
          tmdbId: 2,
          qualityProfileId: 1,
          tags: [],
          genres: [],
          added: daysAgoIso(2),
          path: '/m/2',
        },
      ]);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'addedDaysAgo', value: { max: 7 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['New']);
    });
  });

  describe('sizeOnDiskGb range', () => {
    const sizedMovies = [
      {
        id: 1,
        title: 'Small',
        year: 2001,
        hasFile: true,
        monitored: true,
        tmdbId: 1,
        qualityProfileId: 1,
        tags: [],
        genres: [],
        statistics: { sizeOnDisk: 1 * GB },
        path: '/m/1',
      },
      {
        id: 2,
        title: 'Large',
        year: 2002,
        hasFile: true,
        monitored: true,
        tmdbId: 2,
        qualityProfileId: 1,
        tags: [],
        genres: [],
        statistics: { sizeOnDisk: 50 * GB },
        path: '/m/2',
      },
    ];

    it('returns only movies at least N GB on disk', async () => {
      const client = clientWithMovies(sizedMovies);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'sizeOnDiskGb', value: { min: 10 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Large']);
    });

    it('returns only movies at most N GB on disk', async () => {
      const client = clientWithMovies(sizedMovies);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'sizeOnDiskGb', value: { max: 10 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Small']);
    });
  });

  describe('radarrImdbRating range', () => {
    const ratedMovies = [
      {
        id: 1,
        title: 'Low',
        year: 2001,
        hasFile: true,
        monitored: true,
        tmdbId: 1,
        qualityProfileId: 1,
        tags: [],
        genres: [],
        ratings: { imdb: { value: 4.5 } },
        path: '/m/1',
      },
      {
        id: 2,
        title: 'High',
        year: 2002,
        hasFile: true,
        monitored: true,
        tmdbId: 2,
        qualityProfileId: 1,
        tags: [],
        genres: [],
        ratings: { imdb: { value: 8.5 } },
        path: '/m/2',
      },
    ];

    it('returns only movies with IMDB rating at least N', async () => {
      const client = clientWithMovies(ratedMovies);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'imdbRating', value: { min: 7 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['High']);
    });

    it('returns only movies with IMDB rating at most N', async () => {
      const client = clientWithMovies(ratedMovies);
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'imdbRating', value: { max: 7 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Low']);
    });
  });
});
