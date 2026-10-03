import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { createMockConfig } from '@tests/factories';
import { createRadarrMovie } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';

describe('GET /api/media-queries/:id/preview', () => {
  let client: ReturnType<typeof createApiClient>;
  let mediaQueryService: MediaQueryService;
  let seededQueryId: number;
  let filteredQueryId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5093,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    mediaQueryService = new MediaQueryService({ db });
    const query = await mediaQueryService.create({
      name: 'Preview Query',
      contentType: 'movie',
      filterValues: [],
    });
    seededQueryId = query.id;

    const filtered = await mediaQueryService.create({
      name: 'Downloaded Movies',
      contentType: 'movie',
      filterValues: [{ key: 'hasFile', value: true }],
    });
    filteredQueryId = filtered.id;

    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-api-key',
    });

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ mediaQueries: createMediaQueryProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('returns { count, instances } for a known query id', async () => {
    const res = await client.get(`/api/media-queries/${seededQueryId}/preview`);
    const data = expectSuccessResponse(res);
    expect(data).toMatchObject({ count: expect.any(Number), instances: expect.any(Array) });
  });

  it('returns 404 for an unknown query id', async () => {
    const res = await client.get('/api/media-queries/9999/preview');
    expectErrorResponse(res, 404);
  });

  it('returns the engine match count for the query against the active instance, named in instances', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          createRadarrMovie({ id: 1, title: 'Downloaded', hasFile: true }),
          createRadarrMovie({ id: 2, title: 'Missing', hasFile: false }),
        ])
      )
    );

    const res = await client.get(`/api/media-queries/${filteredQueryId}/preview`);
    const data = expectSuccessResponse(res);
    expect(data.count).toBe(1);
    expect(data.instances).toEqual([{ providerId: expect.any(Number), name: 'Radarr', count: 1 }]);
  });

  it('returns { count: 0, instances: [] } when no instance is active', async () => {
    const noInstanceQuery = await mediaQueryService.create({
      name: 'No Instance',
      contentType: 'show',
      filterValues: [],
    });

    const res = await client.get(`/api/media-queries/${noInstanceQuery.id}/preview`);
    const data = expectSuccessResponse(res);
    expect(data).toEqual({ count: 0, instances: [] });
  });
});
