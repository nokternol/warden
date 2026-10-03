import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Phase 2 — Cycle 2.0 pinning / characterization net.
 *
 * Captures CURRENT listMovies/listSeries behaviour for the parity predicates and
 * structural guarantees most likely to silently regress when the browse path is
 * swapped onto the canonical filterRegistry: genres, seriesType, network, sort
 * ordering, pagination, yearRange independence, and the raw-item response shape.
 *
 * These are regression guards — they must be green BEFORE and AFTER the swap.
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
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PIN_MOVIES = [
  {
    id: 1,
    title: 'Alpha',
    year: 2001,
    hasFile: true,
    monitored: true,
    tmdbId: 101,
    qualityProfileId: 1,
    tags: [1],
    genres: ['Action', 'Sci-Fi'],
    path: '/movies/Alpha',
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
    genres: ['Drama'],
    path: '/movies/Bravo',
  },
  {
    id: 3,
    title: 'Charlie',
    year: 2010,
    hasFile: true,
    monitored: true,
    tmdbId: 103,
    qualityProfileId: 1,
    tags: [2],
    genres: ['Action'],
    path: '/movies/Charlie',
  },
];

const PIN_SERIES = [
  {
    id: 1,
    title: 'Show A',
    year: 2008,
    status: 'ended',
    monitored: true,
    tvdbId: 201,
    qualityProfileId: 1,
    tags: [1],
    genres: ['Drama'],
    network: 'HBO',
    seriesType: 'standard',
    path: '/tv/Show A',
    seasons: [],
  },
  {
    id: 2,
    title: 'Show B',
    year: 2015,
    status: 'continuing',
    monitored: false,
    tvdbId: 202,
    qualityProfileId: 2,
    tags: [],
    genres: ['Comedy'],
    network: 'Netflix',
    seriesType: 'anime',
    path: '/tv/Show B',
    seasons: [],
  },
  {
    id: 3,
    title: 'Show C',
    year: 2018,
    status: 'ended',
    monitored: true,
    tvdbId: 203,
    qualityProfileId: 1,
    tags: [1],
    genres: ['Drama'],
    network: 'HBO',
    seriesType: 'standard',
    path: '/tv/Show C',
    seasons: [],
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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Media browse — Phase 2 pinning net', () => {
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
    await providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
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
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(PIN_MOVIES)),
      http.get('http://localhost:8989/api/v3/series', () => HttpResponse.json(PIN_SERIES))
    );
  });

  // ─── Genres ────────────────────────────────────────────────────────────────

  describe('movieGenres filter (OR over genre strings)', () => {
    it('returns movies having any of the requested genres', async () => {
      const res = await client.get('/api/media/movies?movieGenres=Action&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title).sort()).toEqual([
        'Alpha',
        'Charlie',
      ]);
    });

    it('narrows to a single genre', async () => {
      const res = await client.get('/api/media/movies?movieGenres=Drama&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Bravo']);
    });
  });

  describe('seriesGenres filter', () => {
    it('returns series having the requested genre', async () => {
      const res = await client.get('/api/media/series?seriesGenres=Drama&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((s: { title: string }) => s.title).sort()).toEqual([
        'Show A',
        'Show C',
      ]);
    });
  });

  // ─── Series type / network ──────────────────────────────────────────────────

  describe('seriesType filter', () => {
    it('returns only series of the requested type', async () => {
      const res = await client.get('/api/media/series?seriesType=anime&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((s: { title: string }) => s.title)).toEqual(['Show B']);
    });
  });

  describe('network filter', () => {
    it('returns only series on the requested network', async () => {
      const res = await client.get('/api/media/series?network=HBO&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((s: { title: string }) => s.title).sort()).toEqual([
        'Show A',
        'Show C',
      ]);
    });
  });

  // ─── Sort ────────────────────────────────────────────────────────────────────

  describe('sort ordering', () => {
    it('defaults to title_asc', async () => {
      const res = await client.get('/api/media/movies?pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
      ]);
    });

    it('sorts movies by year_desc', async () => {
      const res = await client.get('/api/media/movies?sort=year_desc&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual([
        'Charlie',
        'Alpha',
        'Bravo',
      ]);
    });

    it('sorts movies by status_asc (hasFile false first, stable within equal)', async () => {
      const res = await client.get('/api/media/movies?sort=status_asc&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual([
        'Bravo',
        'Alpha',
        'Charlie',
      ]);
    });

    it('sorts series by status_asc (monitored false first)', async () => {
      const res = await client.get('/api/media/series?sort=status_asc&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items[0]).toMatchObject({ title: 'Show B', monitored: false });
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('returns the first page sized to pageSize with full totalCount', async () => {
      const res = await client.get('/api/media/movies?page=1&pageSize=2');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(3);
      expect(data.items).toHaveLength(2);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('returns the remainder on the second page', async () => {
      const res = await client.get('/api/media/movies?page=2&pageSize=2');
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Charlie']);
    });
  });

  // ─── yearRange independence ───────────────────────────────────────────────────

  describe('yearRange', () => {
    it('reflects the full unfiltered library even when a filter narrows results', async () => {
      const res = await client.get('/api/media/movies?title=alpha');
      const data = expectSuccessResponse(res);
      expect(data.items).toHaveLength(1);
      expect(data.yearRange).toMatchObject({ min: 1995, max: 2010 });
    });
  });

  // ─── Raw item response shape ──────────────────────────────────────────────────

  describe('response item shape', () => {
    it('returns the raw provider item (not a normalized projection)', async () => {
      const res = await client.get('/api/media/movies?title=alpha');
      const data = expectSuccessResponse(res);
      // Raw RadarrMovie fields must survive — the swap filters on Normalized* but
      // must map matched ids back to the raw item for the response.
      expect(data.items[0]).toMatchObject({
        id: 1,
        title: 'Alpha',
        tmdbId: 101,
        qualityProfileId: 1,
        genres: ['Action', 'Sci-Fi'],
        path: '/movies/Alpha',
      });
    });
  });
});
