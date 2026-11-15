import { buildContainer } from '@server/container';
import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { resetMediaData } from '@server/modules/media/mediaReset';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { createMockConfig } from '@tests/factories';
import { createRadarrMovie } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { refreshCatalog } from '@tests/helpers/library';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';

describe('GET /api/media-queries/:id/preview', () => {
  let client: ReturnType<typeof createApiClient>;
  let mediaQueryService: MediaQueryService;
  let seededQueryId: number;
  let filteredQueryId: number;
  let cradle: ReturnType<typeof buildContainer>['cradle'];

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
    cradle = container.cradle;

    mediaQueryService = new MediaQueryService({ db, filterReadiness: filterReadinessOver(db) });
    const query = await mediaQueryService.create({
      name: 'Preview Query',
      contentType: 'movie',
      filters: [],
    });
    seededQueryId = query.id;

    const filtered = await mediaQueryService.create({
      name: 'Downloaded Movies',
      contentType: 'movie',
      filters: [{ ruleKey: 'hasFile', value: true }],
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

  it('returns { count, records } for a known query id', async () => {
    const res = await client.get(`/api/media-queries/${seededQueryId}/preview`);
    const data = expectSuccessResponse(res);
    expect(data).toEqual({ count: expect.any(Number), records: expect.any(Array) });
  });

  it('returns 404 for an unknown query id', async () => {
    const res = await client.get('/api/media-queries/9999/preview');
    expectErrorResponse(res, 404);
  });

  it('counts the titles the last catalog refresh stored, without reading Radarr', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          createRadarrMovie({ id: 1, title: 'Downloaded', hasFile: true }),
          createRadarrMovie({ id: 2, title: 'Missing', hasFile: false }),
        ])
      )
    );
    await refreshCatalog(cradle);
    let radarrReads = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/*`, () => {
        radarrReads++;
        return HttpResponse.json([]);
      })
    );

    const data = expectSuccessResponse(
      await client.get(`/api/media-queries/${filteredQueryId}/preview`)
    );

    expect(data.count).toBe(1);
    expect(data.records).toContainEqual(
      expect.objectContaining({ provider: 'Radarr', kind: 'catalog', error: null })
    );
    expect(radarrReads).toBe(0);
  });

  it('returns { count: 0 } when no instance is active', async () => {
    const noInstanceQuery = await mediaQueryService.create({
      name: 'No Instance',
      contentType: 'series',
      filters: [],
    });

    const res = await client.get(`/api/media-queries/${noInstanceQuery.id}/preview`);
    expect(expectSuccessResponse(res).count).toBe(0);
  });
});
