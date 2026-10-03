import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Media filter integration tests — Cycle 1 RED
 *
 * Verifies server-side filter predicates on /api/media/movies,
 * /api/media/series, /api/media/tags, and /api/media/quality-profiles.
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

const FILTER_MOVIES = [
  {
    id: 1,
    title: 'Batman Begins',
    year: 2005,
    hasFile: true,
    monitored: true,
    tmdbId: 272,
    profileId: 1,
    qualityProfileId: 1,
    tags: [1, 2],
    folderName: '/movies/Batman Begins',
    path: '/movies/Batman Begins',
  },
  {
    id: 2,
    title: 'Batman Returns',
    year: 1992,
    hasFile: false,
    monitored: false,
    tmdbId: 364,
    profileId: 1,
    qualityProfileId: 2,
    tags: [1],
    folderName: '/movies/Batman Returns',
    path: '/movies/Batman Returns',
  },
  {
    id: 3,
    title: 'The Matrix',
    year: 1999,
    hasFile: true,
    monitored: true,
    tmdbId: 603,
    profileId: 1,
    qualityProfileId: 1,
    tags: [2],
    folderName: '/movies/The Matrix',
    path: '/movies/The Matrix',
  },
  {
    id: 4,
    title: 'Dark Knight',
    year: 2008,
    hasFile: true,
    monitored: true,
    tmdbId: 155,
    profileId: 1,
    qualityProfileId: 2,
    tags: [],
    folderName: '/movies/Dark Knight',
    path: '/movies/Dark Knight',
  },
];

const FILTER_SERIES = [
  {
    id: 1,
    title: 'Breaking Bad',
    year: 2008,
    status: 'ended',
    monitored: true,
    tvdbId: 81189,
    profileId: 1,
    qualityProfileId: 1,
    languageProfileId: 1,
    tags: [1],
    path: '/tv/Breaking Bad',
    seasons: [{ seasonNumber: 1, monitored: true }],
  },
  {
    id: 2,
    title: 'Better Call Saul',
    year: 2015,
    status: 'ended',
    monitored: false,
    tvdbId: 273181,
    profileId: 1,
    qualityProfileId: 2,
    languageProfileId: 1,
    tags: [],
    path: '/tv/Better Call Saul',
    seasons: [{ seasonNumber: 1, monitored: false }],
  },
  {
    id: 3,
    title: 'Succession',
    year: 2018,
    status: 'ended',
    monitored: true,
    tvdbId: 320785,
    profileId: 1,
    qualityProfileId: 1,
    languageProfileId: 1,
    tags: [1],
    path: '/tv/Succession',
    seasons: [{ seasonNumber: 1, monitored: true }],
  },
  {
    id: 4,
    title: 'The Boys',
    year: 2019,
    status: 'continuing',
    monitored: true,
    tvdbId: 360893,
    profileId: 1,
    qualityProfileId: 2,
    languageProfileId: 1,
    tags: [],
    path: '/tv/The Boys',
    seasons: [{ seasonNumber: 1, monitored: true }],
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

describe('Media Filter API', () => {
  let client: ReturnType<typeof createApiClient>;
  let unauthedClient: ReturnType<typeof createApiClient>;

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

    const mediaRoutes = serveApi({ media: createMediaProcedures(container.cradle).procedures });

    const authedApp: Express = express();
    authedApp.use(express.json());
    authedApp.use(requestIdMiddleware);
    authedApp.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = mockUser;
      next();
    });
    authedApp.use('/api/media', mediaRoutes);
    authedApp.use(errorHandlerMiddleware);

    const unauthedApp: Express = express();
    unauthedApp.use(express.json());
    unauthedApp.use(requestIdMiddleware);
    unauthedApp.use('/api/media', mediaRoutes);
    unauthedApp.use(errorHandlerMiddleware);

    client = createApiClient(authedApp);
    unauthedClient = createApiClient(unauthedApp);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Populate cache with our fixture data before every test.
  // vitest.server.ts resets handlers in afterEach so we re-apply here.
  beforeEach(() => {
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(FILTER_MOVIES)),
      http.get('http://localhost:8989/api/v3/series', () => HttpResponse.json(FILTER_SERIES))
    );
  });

  // ─── A01 — Title search ────────────────────────────────────────────────────

  describe('GET /api/media/movies — title filter (A01)', () => {
    it('returns only movies whose title contains the search term (case-insensitive)', async () => {
      const res = await client.get('/api/media/movies?title=batman');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(2);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(
        expect.arrayContaining(['Batman Begins', 'Batman Returns'])
      );
    });

    it('is case-insensitive', async () => {
      const res = await client.get('/api/media/movies?title=BATMAN');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(2);
    });

    it('returns empty when no titles match', async () => {
      const res = await client.get('/api/media/movies?title=unicorn');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
      expect(data.items).toHaveLength(0);
    });

    it('returns all movies when no title param is supplied', async () => {
      const res = await client.get('/api/media/movies?pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(4);
    });
  });

  // ─── A02 — Status (hasFile) filter ────────────────────────────────────────

  describe('GET /api/media/movies — hasFile filter (A02)', () => {
    it('returns only downloaded movies when hasFile=true', async () => {
      const res = await client.get('/api/media/movies?hasFile=true');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(3);
      expect(data.items.every((m: { hasFile: boolean }) => m.hasFile === true)).toBe(true);
    });

    it('returns only missing movies when hasFile=false', async () => {
      const res = await client.get('/api/media/movies?hasFile=false');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(1);
      expect(data.items[0]).toMatchObject({ title: 'Batman Returns', hasFile: false });
    });
  });

  // ─── A02 — Series monitored / status filters ──────────────────────────────

  describe('GET /api/media/series — monitored filter (A02)', () => {
    it('returns only monitored series when monitored=true', async () => {
      const res = await client.get('/api/media/series?monitored=true');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(3);
      expect(data.items.every((s: { monitored: boolean }) => s.monitored === true)).toBe(true);
    });

    it('returns only unmonitored series when monitored=false', async () => {
      const res = await client.get('/api/media/series?monitored=false');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(1);
      expect(data.items[0]).toMatchObject({ title: 'Better Call Saul', monitored: false });
    });
  });

  describe('GET /api/media/series — seriesStatus filter', () => {
    it('returns only ended series when seriesStatus=ended', async () => {
      const res = await client.get('/api/media/series?seriesStatus=ended');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(3);
      expect(data.items.every((s: { status: string }) => s.status === 'ended')).toBe(true);
    });

    it('returns only continuing series when seriesStatus=continuing', async () => {
      const res = await client.get('/api/media/series?seriesStatus=continuing');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(1);
      expect(data.items[0]).toMatchObject({ title: 'The Boys', status: 'continuing' });
    });
  });

  // ─── A03 — Year range ─────────────────────────────────────────────────────

  describe('GET /api/media/movies — year range filter (A03)', () => {
    it('returns movies within yearMin and yearMax (inclusive)', async () => {
      const res = await client.get('/api/media/movies?yearMin=2005&yearMax=2008');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(2);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(
        expect.arrayContaining(['Batman Begins', 'Dark Knight'])
      );
    });

    it('excludes movies outside the year range', async () => {
      const res = await client.get('/api/media/movies?yearMin=2005&yearMax=2008');
      const data = expectSuccessResponse(res);

      const titles = data.items.map((m: { title: string }) => m.title);
      expect(titles).not.toContain('Batman Returns'); // 1992
      expect(titles).not.toContain('The Matrix'); // 1999
    });

    it('yearMin alone filters out older movies', async () => {
      const res = await client.get('/api/media/movies?yearMin=2000');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(2); // Batman Begins (2005), Dark Knight (2008)
    });

    it('yearMax alone filters out newer movies', async () => {
      const res = await client.get('/api/media/movies?yearMax=1999');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(2); // Batman Returns (1992), The Matrix (1999)
    });
  });

  // ─── A04 — Tag filter (OR semantics) ──────────────────────────────────────

  describe('GET /api/media/movies — movieTagIds filter (A04)', () => {
    it('returns movies that have the specified tag', async () => {
      const res = await client.get('/api/media/movies?movieTagIds=1');
      const data = expectSuccessResponse(res);

      // Batman Begins [1,2], Batman Returns [1]
      expect(data.totalCount).toBe(2);
    });

    it('applies OR semantics — returns movies having ANY of the specified tags', async () => {
      const res = await client.get('/api/media/movies?movieTagIds=1,2');
      const data = expectSuccessResponse(res);

      // Batman Begins [1,2], Batman Returns [1], The Matrix [2] — all have tag 1 OR tag 2
      expect(data.totalCount).toBe(3);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(
        expect.arrayContaining(['Batman Begins', 'Batman Returns', 'The Matrix'])
      );
    });

    it('returns empty when no movies have any of the specified tags', async () => {
      const res = await client.get('/api/media/movies?movieTagIds=99,100');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
    });
  });

  // ─── Instance qualification (§10) ──────────────────────────────────────────

  describe('GET /api/media/movies — movieTagIdsProviderId qualification', () => {
    it('matches when the ProviderId names the active Radarr instance', async () => {
      const sourcesRes = await client.get('/api/media/sources');
      const sources = expectSuccessResponse(sourcesRes) as Array<{
        contentType: string;
        instances: Array<{ id: number; name: string }>;
      }>;
      const radarrId = sources.find((s) => s.contentType === 'movie')?.instances[0]?.id;
      expect(radarrId).toBeDefined();

      const res = await client.get(
        `/api/media/movies?movieTagIds=1&movieTagIdsProviderId=${radarrId}`
      );
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(2); // Batman Begins [1,2], Batman Returns [1]
    });

    it('matches nothing when the ProviderId names a different instance', async () => {
      const res = await client.get('/api/media/movies?movieTagIds=1&movieTagIdsProviderId=999999');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
    });

    it("is unqualified (today's behavior) when the ProviderId param is omitted", async () => {
      const res = await client.get('/api/media/movies?movieTagIds=1');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(2);
    });
  });

  describe('GET /api/media/series — seriesTagIds filter', () => {
    it('returns only series with the specified tag', async () => {
      const res = await client.get('/api/media/series?seriesTagIds=1');
      const data = expectSuccessResponse(res);

      // Breaking Bad [1], Succession [1]
      expect(data.totalCount).toBe(2);
      expect(data.items.map((s: { title: string }) => s.title)).toEqual(
        expect.arrayContaining(['Breaking Bad', 'Succession'])
      );
    });
  });

  // ─── A05 — Quality profile filter (OR semantics) ──────────────────────────

  describe('GET /api/media/movies — movieQualityProfileIds filter (A05)', () => {
    it('returns movies on the specified profile', async () => {
      const res = await client.get('/api/media/movies?movieQualityProfileIds=1');
      const data = expectSuccessResponse(res);

      // Batman Begins (profile 1), The Matrix (profile 1)
      expect(data.totalCount).toBe(2);
    });

    it('applies OR semantics — returns movies on any of the specified profiles', async () => {
      const res = await client.get('/api/media/movies?movieQualityProfileIds=1,2');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(4); // all movies
    });
  });

  describe('GET /api/media/series — seriesQualityProfileIds filter', () => {
    it('returns only series on the specified profile', async () => {
      const res = await client.get('/api/media/series?seriesQualityProfileIds=2');
      const data = expectSuccessResponse(res);

      // Better Call Saul (profile 2), The Boys (profile 2)
      expect(data.totalCount).toBe(2);
    });
  });

  // ─── A06 — Multi-filter conjunction ───────────────────────────────────────

  describe('GET /api/media/movies — multi-filter AND conjunction (A06)', () => {
    it('combines title + hasFile + yearMin with AND semantics', async () => {
      // "bat" + downloaded + after 2000 → only Batman Begins (2005, hasFile)
      const res = await client.get('/api/media/movies?title=bat&hasFile=true&yearMin=2000');
      const data = expectSuccessResponse(res);

      expect(data.totalCount).toBe(1);
      expect(data.items[0]).toMatchObject({ title: 'Batman Begins' });
    });

    it('returns empty when conjunctive filters have no intersection', async () => {
      // Missing movies after 2005 → Batman Returns is 1992, no match
      const res = await client.get('/api/media/movies?hasFile=false&yearMin=2005');
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
    });
  });

  // ─── A07 — yearRange in response ──────────────────────────────────────────

  describe('yearRange in paginated response (A07)', () => {
    it('includes yearRange computed from the full unfiltered library', async () => {
      const res = await client.get('/api/media/movies?page=1&pageSize=2');
      const data = expectSuccessResponse(res);

      // Movies: 1992, 1999, 2005, 2008 → min=1992, max=2008
      expect(data).toHaveProperty('yearRange');
      expect(data.yearRange).toMatchObject({ min: 1992, max: 2008 });
    });

    it('yearRange does not change when a filter narrows the result set', async () => {
      // Only Batman Begins (2005) matches, but yearRange must still reflect full library
      const res = await client.get('/api/media/movies?title=batman+begins');
      const data = expectSuccessResponse(res);

      expect(data.yearRange).toMatchObject({ min: 1992, max: 2008 });
    });

    it('includes yearRange in series response', async () => {
      const res = await client.get('/api/media/series?page=1&pageSize=2');
      const data = expectSuccessResponse(res);

      // Series: 2008, 2015, 2018, 2019 → min=2008, max=2019
      expect(data).toHaveProperty('yearRange');
      expect(data.yearRange).toMatchObject({ min: 2008, max: 2019 });
    });
  });

  // ─── A08 — Tags endpoint ──────────────────────────────────────────────────

  describe('GET /api/media/tags (A08)', () => {
    it('returns radarr and sonarr tags with human-readable labels', async () => {
      const res = await client.get('/api/media/tags');
      const data = expectSuccessResponse(res);

      expect(data).toHaveProperty('radarr');
      expect(data).toHaveProperty('sonarr');

      expect(data.radarr).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, label: 'action' }),
          expect.objectContaining({ id: 2, label: 'sci-fi' }),
        ])
      );
      expect(data.sonarr).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 1, label: 'drama' })])
      );
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await unauthedClient.get('/api/media/tags');
      expect(res.status).toBe(401);
    });
  });

  // ─── Quality profiles endpoint ────────────────────────────────────────────

  describe('GET /api/media/quality-profiles', () => {
    it('returns radarr and sonarr quality profiles', async () => {
      const res = await client.get('/api/media/quality-profiles');
      const data = expectSuccessResponse(res);

      expect(data).toHaveProperty('radarr');
      expect(data).toHaveProperty('sonarr');

      expect(data.radarr).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'HD-1080p' }),
          expect.objectContaining({ id: 2, name: 'Any' }),
        ])
      );
      expect(data.sonarr).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'HD-1080p' }),
          expect.objectContaining({ id: 2, name: 'Any' }),
        ])
      );
    });
  });
});
