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

  // The container's one read cache outlives each test; each test sets its own upstream answers.
  afterEach(() => cradle.sourceReadCache.clear());

  it('returns { count } for a known query id', async () => {
    const res = await client.get(`/api/media-queries/${seededQueryId}/preview`);
    const data = expectSuccessResponse(res);
    expect(data).toEqual({ count: expect.any(Number) });
  });

  it('returns 404 for an unknown query id', async () => {
    const res = await client.get('/api/media-queries/9999/preview');
    expectErrorResponse(res, 404);
  });

  it('returns the engine match count for the query against the active instance', async () => {
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
    expect(data).toEqual({ count: 1 });
  });

  it('returns { count: 0 } when no instance is active', async () => {
    const noInstanceQuery = await mediaQueryService.create({
      name: 'No Instance',
      contentType: 'series',
      filters: [],
    });

    const res = await client.get(`/api/media-queries/${noInstanceQuery.id}/preview`);
    const data = expectSuccessResponse(res);
    expect(data).toEqual({ count: 0 });
  });

  it("answers from the instance's latest read: an unreadable Radarr fails the preview, naming it, without a second upstream read inside the TTL", async () => {
    let reads = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => {
        reads++;
        return new HttpResponse(null, { status: 500 });
      })
    );

    const preview = async () => {
      const error = expectErrorResponse(
        await client.get(`/api/media-queries/${filteredQueryId}/preview`),
        500
      );
      expect(error.message).toContain("Radarr: Couldn't be reached");
    };

    await preview();
    // One read may make several attempts (the HTTP client retries a 500); a second preview makes none.
    const readsByFirstPreview = reads;
    await preview();
    expect(reads).toBe(readsByFirstPreview);
  });

  it('enrichment merged into one preview never appears in the next, even after a reset, with no re-read', async () => {
    let reads = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => {
        reads++;
        return HttpResponse.json([createRadarrMovie({ id: 1, title: 'Requested' })]);
      })
    );
    const db = getDb();
    const [radarr] = await db
      .select({ id: metadataProviders.id })
      .from(metadataProviders)
      .where(eq(metadataProviders.type, MetadataProviderType.RADARR));
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'movie', enrichedAt: Math.floor(Date.now() / 1000) })
      .returning();
    await db
      .insert(mediaItems)
      .values({ providerId: radarr.id, externalId: 1, mediaIdentityId: identity.id });
    await new EnrichmentQueries({ db }).replaceFields(identity.id, { seerrRequestStatus: 2 });
    const requested = await mediaQueryService.create({
      name: 'Requested',
      contentType: 'movie',
      filters: [{ ruleKey: 'seerrRequestStatus', value: 2 }],
    });
    const preview = async () =>
      expectSuccessResponse(await client.get(`/api/media-queries/${requested.id}/preview`)).count;

    const before = await preview();
    const readsByFirstPreview = reads;
    await resetMediaData(db);

    expect({ before, after: await preview(), reads }).toEqual({
      before: 1,
      after: 0,
      reads: readsByFirstPreview,
    });
  });
});
