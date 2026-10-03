import { buildContainer } from '@server/container';
/**
 * Phase 7 — browse display dedup across multiple active instances.
 *
 * Verifies /api/media/movies groups matched raw rows by native primary id
 * (tmdbId), computed live per request (no DB dependency): a title appears once
 * even when two active Radarr instances both report it, with additive
 * `sourceCount`/`sourceProviderIds` fields; ANY filter semantics (a title
 * matches if at least one of its copies matched); single-instance rows stay
 * byte-identical apart from the additive fields.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
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

const RADARR_URL = 'http://localhost:7878';
const RADARR_4K_URL = 'http://localhost:7879';

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

describe('Browse display dedup — multiple active Radarr instances', () => {
  let client: ReturnType<typeof createApiClient>;
  let radarrId: number;
  let radarr4kId: number;

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

    const radarr = await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'key-1',
    });
    radarrId = radarr.id;
    const radarr4k = await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4k',
      url: `${RADARR_4K_URL}/api/v3`,
      apiKey: 'key-2',
    });
    radarr4kId = radarr4k.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Each test's movie payload differs, and MediaCache has a 60s TTL — rebuild the
  // handlers (and their caches) fresh per test rather than reuse one across tests.
  beforeEach(() => {
    const container = buildContainer({ config: loadConfig(), db: getDb() });
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

  it("collapses two instances' copies of the same tmdbId into one row with sourceCount/sourceProviderIds", async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          {
            id: 1,
            title: 'The Matrix',
            hasFile: true,
            monitored: true,
            tmdbId: 603,
            profileId: 1,
            qualityProfileId: 1,
            tags: [],
            folderName: '/m/matrix',
            path: '/m/matrix',
          },
        ])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          {
            id: 55,
            title: 'The Matrix (4K)',
            hasFile: true,
            monitored: true,
            tmdbId: 603,
            profileId: 1,
            qualityProfileId: 1,
            tags: [],
            folderName: '/m/matrix4k',
            path: '/m/matrix4k',
          },
        ])
      )
    );

    const res = await client.get('/api/media/movies?pageSize=100');
    const data = expectSuccessResponse(res);

    expect(data.totalCount).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sourceCount).toBe(2);
    expect(data.items[0].sourceProviderIds.sort()).toEqual([radarrId, radarr4kId].sort());
  });

  it('ANY semantics: a title appears if at least one of its copies matches the filter', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          {
            id: 1,
            title: 'Downloaded 4K only',
            hasFile: false, // this instance's copy has no file
            monitored: true,
            tmdbId: 700,
            profileId: 1,
            qualityProfileId: 1,
            tags: [],
            folderName: '/m/d4k',
            path: '/m/d4k',
          },
        ])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          {
            id: 66,
            title: 'Downloaded 4K only',
            hasFile: true, // 4k copy has a file
            monitored: true,
            tmdbId: 700,
            profileId: 1,
            qualityProfileId: 1,
            tags: [],
            folderName: '/m/d4k-4k',
            path: '/m/d4k-4k',
          },
        ])
      )
    );

    const res = await client.get('/api/media/movies?hasFile=true&pageSize=100');
    const data = expectSuccessResponse(res);

    expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Downloaded 4K only']);
    expect(data.items[0].sourceCount).toBe(1); // only the matching copy collapsed in
  });

  it('a single-instance row carries sourceCount:1 and sourceProviderIds:[that instance]', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          {
            id: 9,
            title: 'Solo',
            hasFile: true,
            monitored: true,
            tmdbId: 900,
            profileId: 1,
            qualityProfileId: 1,
            tags: [],
            folderName: '/m/solo',
            path: '/m/solo',
          },
        ])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () => HttpResponse.json([]))
    );

    const res = await client.get('/api/media/movies?pageSize=100');
    const data = expectSuccessResponse(res);

    const solo = data.items.find((m: { title: string }) => m.title === 'Solo');
    expect(solo.sourceCount).toBe(1);
    expect(solo.sourceProviderIds).toEqual([radarrId]);
  });
});
