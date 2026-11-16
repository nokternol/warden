import { buildContainer } from '@server/container';
/**
 * Phase 7 — browse display dedup across multiple active instances.
 *
 * Verifies /api/media/movie shows each title the filters select once, even when
 * two active Radarr instances both hold it, with `sourceCount`/`sourceProviderIds`
 * counting every copy; the row is the title's first copy, in the requested order,
 * that alone meets the filters; single-instance rows stay byte-identical apart
 * from the additive fields.
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, mediaIdentity } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { refreshCatalog } from '@tests/helpers/library';
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

let libraryCradle: import('@server/container').Cradle;
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
    libraryCradle = container.cradle;

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
  beforeEach(async () => {
    // Each test's providers answer afresh; start from an empty copy.
    await getDb().delete(mediaIdentity);
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

    await refreshCatalog(libraryCradle);
    const res = await client.get(browsePath('movie', [], { pageSize: 100 }));
    const data = expectSuccessResponse(res);

    expect(data.totalCount).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sourceCount).toBe(2);
    expect(data.items[0].sourceProviderIds.sort()).toEqual([radarrId, radarr4kId].sort());
  });

  it('shows a title through the copy that meets the filter, counting every copy', async () => {
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

    await refreshCatalog(libraryCradle);
    const res = await client.get(
      browsePath('movie', [{ ruleKey: 'hasFile', value: true }], { pageSize: 100 })
    );
    const data = expectSuccessResponse(res);

    expect(data.items.map((m: { id: number }) => m.id)).toEqual([66]); // the 4K copy has a file
    expect(data.items[0].sourceCount).toBe(2);
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

    await refreshCatalog(libraryCradle);
    const res = await client.get(browsePath('movie', [], { pageSize: 100 }));
    const data = expectSuccessResponse(res);

    const solo = data.items.find((m: { title: string }) => m.title === 'Solo');
    expect(solo.sourceCount).toBe(1);
    expect(solo.sourceProviderIds).toEqual([radarrId]);
  });

  it('keeps copies whose primary id is 0 as separate titles, even on different instances', async () => {
    const row = (id: number, title: string) => ({
      id,
      title,
      hasFile: true,
      monitored: true,
      tmdbId: 0,
      profileId: 1,
      qualityProfileId: 1,
      tags: [],
      folderName: `/m/${id}`,
      path: `/m/${id}`,
    });
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json([row(1, 'Unlisted A')])),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () => HttpResponse.json([row(2, 'Unlisted B')]))
    );

    await refreshCatalog(libraryCradle);
    const res = await client.get(browsePath('movie', [], { pageSize: 100 }));
    const data = expectSuccessResponse(res);

    expect(data.totalCount).toBe(2);
    expect(data.items.map((m: { sourceCount: number }) => m.sourceCount)).toEqual([1, 1]);
  });

  it('shows copies the catalog refresh grouped as one title as one row, by the same rule everywhere', async () => {
    // No TMDB id, so only the refresh's grouping rule (here, the shared IMDb id) joins them.
    const row = (id: number) => ({
      id,
      title: 'Imported Without TMDB',
      year: 2001,
      hasFile: true,
      monitored: true,
      tmdbId: 0,
      imdbId: 'tt0123456',
      profileId: 1,
      qualityProfileId: 1,
      tags: [],
      folderName: `/m/${id}`,
      path: `/m/${id}`,
    });
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json([row(1)])),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () => HttpResponse.json([row(2)]))
    );

    await refreshCatalog(libraryCradle);
    const data = expectSuccessResponse(
      await client.get(browsePath('movie', [], { pageSize: 100 }))
    );

    expect(data.totalCount).toBe(1);
    expect(data.items[0].sourceProviderIds.sort()).toEqual([radarrId, radarr4kId].sort());
  });

  it('shows a title met only by different copies through its first copy in the requested order', async () => {
    const row = (id: number, title: string, hasFile: boolean, tags: number[]) => ({
      id,
      title,
      hasFile,
      monitored: true,
      tmdbId: 800,
      profileId: 1,
      qualityProfileId: 1,
      tags,
      folderName: `/m/${id}`,
      path: `/m/${id}`,
    });
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([row(1, 'Zeta Cut', false, [])])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () =>
        HttpResponse.json([row(2, 'Alpha Cut', true, [7])])
      )
    );

    await refreshCatalog(libraryCradle);
    const filters = [
      { ruleKey: 'tagIds', value: { providerId: radarr4kId, ids: [7] } },
      { ruleKey: 'hasFile', value: false },
    ];
    const data = expectSuccessResponse(
      await client.get(browsePath('movie', filters, { pageSize: 100, sort: 'title_asc' }))
    );

    expect(data.totalCount).toBe(1);
    expect(data.items[0].id).toBe(2);
    expect(data.items[0].sourceCount).toBe(2);
  });
});
