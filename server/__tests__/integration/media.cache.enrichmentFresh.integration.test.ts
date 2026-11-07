import { buildContainer } from '@server/container';
import {
  MetadataProviderType,
  mediaEnrichment,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
/**
 * Integration test: browse reads enrichment and identity data fresh on every request.
 *
 * The media caches hold only upstream fetches (Radarr's library and the like). Enrichment
 * rows are read from the database per request, which is why the system jobs that write
 * them, and `media.reset` that deletes them, send no cache event today.
 *
 * If this test fails, a cache over enrichment or identity data has been added. Then
 * `media.reset` and the system jobs must send `media:changed` (the system jobs already
 * declare `affects: 'media'`), and the comment above `SYSTEM_TASKS` in
 * `automationExecutor.ts` must say which cache they now clear.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import type { EnrichmentFields } from '@server/modules/media/mediaFieldProvider';
import { createMockConfig } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MOVIES = [1, 2].map((id) => ({
  id,
  title: `Movie ${id}`,
  year: 2000 + id,
  hasFile: true,
  monitored: true,
  tmdbId: id,
  qualityProfileId: 1,
  tags: [],
  genres: [],
  path: `/m/${id}`,
}));

const MOCK_USER = {
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

const REQUESTED = [{ ruleKey: 'seerrRequestStatus', value: 2 }];

async function seedEnrichment(sourceId: number, fields: Partial<EnrichmentFields>) {
  const db = getDb();
  const [radarr] = await db
    .select({ id: metadataProviders.id })
    .from(metadataProviders)
    .where(eq(metadataProviders.type, MetadataProviderType.RADARR));
  const [identity] = await db
    .insert(mediaIdentity)
    .values({ kind: 'movie', enrichedAt: Math.floor(Date.now() / 1000) })
    .returning();
  await db
    .insert(mediaItems)
    .values({ providerId: radarr.id, externalId: sourceId, mediaIdentityId: identity.id });
  const enrichment = new EnrichmentQueries({ db });
  await enrichment.replaceFields(identity.id, fields);
  return { identityId: identity.id, enrichment };
}

describe('browse reads enrichment fresh, with no cache event', () => {
  let client: ReturnType<typeof createApiClient>;
  let media: ReturnType<typeof createMediaProcedures>;
  let radarrFetches: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });

    media = createMediaProcedures(container.cradle);
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = MOCK_USER;
      next();
    });
    app.use('/api/media', serveApi({ media: media.procedures }));
    app.use(errorHandlerMiddleware);
    client = createApiClient(app);
  });

  afterAll(async () => {
    media.dispose();
    await closeDatabase();
  });

  beforeEach(async () => {
    radarrFetches = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => {
        radarrFetches++;
        return HttpResponse.json(MOVIES);
      })
    );
    const db = getDb();
    await db.delete(mediaEnrichment);
    await db.delete(mediaItems);
    await db.delete(mediaIdentity);
  });

  async function requestedTitles() {
    const res = await client.get(browsePath('movie', REQUESTED, { pageSize: 100 }));
    return expectSuccessResponse(res);
  }

  it('a changed enrichment row changes a filtered browse without refetching Radarr', async () => {
    const { identityId, enrichment } = await seedEnrichment(1, { seerrRequestStatus: 1 });
    expect((await requestedTitles()).totalCount).toBe(0);
    const fetchesAfterWarm = radarrFetches;

    await enrichment.replaceFields(identityId, { seerrRequestStatus: 2 });

    const after = await requestedTitles();
    expect(after.items.map((m: { title: string }) => m.title)).toEqual(['Movie 1']);
    expect(radarrFetches).toBe(fetchesAfterWarm);
  });

  it('DELETE /api/media/reset changes a filtered browse without refetching Radarr', async () => {
    await seedEnrichment(1, { seerrRequestStatus: 2 });
    expect((await requestedTitles()).totalCount).toBe(1);
    const fetchesAfterWarm = radarrFetches;

    const reset = await client.delete('/api/media/reset');
    expect(reset.status).toBe(200);

    expect((await requestedTitles()).totalCount).toBe(0);
    expect(radarrFetches).toBe(fetchesAfterWarm);
  });
});
