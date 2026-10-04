import { buildContainer } from '@server/container';
import {
  MetadataProviderType,
  mediaEnrichment,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
/**
 * Phase 2 — enriched predicates on the browse path.
 *
 * The parallel engine never declared the overseerr or tmdbStatus predicates, so
 * these controls did nothing. After the swap the handler merges media_enrichment
 * the normalized items and filters through the registry. Critically: when there
 * is NO enrichment data, an enriched filter returns 0 items (not "keep all").
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
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ENR_MOVIES = [
  {
    id: 1,
    title: 'Requested',
    year: 2001,
    hasFile: true,
    monitored: true,
    tmdbId: 1,
    qualityProfileId: 1,
    tags: [],
    genres: [],
    path: '/m/1',
  },
  {
    id: 2,
    title: 'Pending',
    year: 2002,
    hasFile: true,
    monitored: true,
    tmdbId: 2,
    qualityProfileId: 1,
    tags: [],
    genres: [],
    path: '/m/2',
  },
  {
    id: 3,
    title: 'NoEnrichment',
    year: 2003,
    hasFile: true,
    monitored: true,
    tmdbId: 3,
    qualityProfileId: 1,
    tags: [],
    genres: [],
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

async function seedEnrichment(sourceId: number, fields: Partial<EnrichmentFields>): Promise<void> {
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
  await new EnrichmentQueries({ db }).replaceFields(identity.id, fields);
}

describe('Media browse — enriched predicates', () => {
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
    await container.cradle.providerSettingsService.create({
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

  beforeEach(async () => {
    server.use(http.get('http://localhost:7878/api/v3/movie', () => HttpResponse.json(ENR_MOVIES)));
    // Each test owns its enrichment state — the suite shares one DB.
    const db = getDb();
    await db.delete(mediaEnrichment);
    await db.delete(mediaIdentity);
  });

  describe('overseerrRequestStatus', () => {
    it('returns only movies whose merged enrichment status equals the requested value', async () => {
      await seedEnrichment(1, { overseerrRequestStatus: 2 });
      await seedEnrichment(2, { overseerrRequestStatus: 1 });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'overseerrRequestStatus', value: 2 }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });

    it('returns 0 items when there is no enrichment data (corrected from "keep all")', async () => {
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'overseerrRequestStatus', value: 2 }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
    });
  });

  describe('overseerrHasIssue', () => {
    it('returns only movies flagged with an issue when overseerrHasIssue=true', async () => {
      await seedEnrichment(1, { overseerrHasIssue: true });
      await seedEnrichment(2, { overseerrHasIssue: false });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'overseerrHasIssue', value: true }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });
  });

  describe('tmdbStatus', () => {
    it('returns only movies whose merged tmdbStatus matches', async () => {
      await seedEnrichment(1, { tmdbStatus: 'Released' });
      await seedEnrichment(2, { tmdbStatus: 'In Production' });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'tmdbStatus', value: 'Released' }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });
  });

  describe('lastWatchedDaysAgoGte', () => {
    it('returns only movies last watched at least N days ago', async () => {
      const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
      await seedEnrichment(1, { lastWatchedAt: daysAgoIso(10) });
      await seedEnrichment(2, { lastWatchedAt: daysAgoIso(2) });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'lastWatchedDaysAgo', value: { min: 7 } }], {
          pageSize: 100,
        })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });
  });

  describe('lastWatchedDaysAgoLte', () => {
    it('returns only movies last watched at most N days ago', async () => {
      const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
      await seedEnrichment(1, { lastWatchedAt: daysAgoIso(10) });
      await seedEnrichment(2, { lastWatchedAt: daysAgoIso(2) });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'lastWatchedDaysAgo', value: { max: 7 } }], {
          pageSize: 100,
        })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Pending']);
    });
  });

  describe('plexAddedDaysAgoGte', () => {
    it('returns only movies added to Plex at least N days ago', async () => {
      const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
      await seedEnrichment(1, { plexAddedAt: daysAgoIso(10) });
      await seedEnrichment(2, { plexAddedAt: daysAgoIso(2) });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'plexAddedDaysAgo', value: { min: 7 } }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });
  });

  describe('tautulliWatched (migrated to enrichment playCount)', () => {
    it('returns only movies with enriched playCount > 0 when tautulliWatched=true', async () => {
      await seedEnrichment(1, { playCount: 3 });
      await seedEnrichment(2, { playCount: 0 });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'watched', value: true }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.items.map((m: { title: string }) => m.title)).toEqual(['Requested']);
    });

    it('returns the complement (incl. movies with no enrichment) when tautulliWatched=false', async () => {
      await seedEnrichment(1, { playCount: 3 });

      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'watched', value: false }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      const titles = data.items.map((m: { title: string }) => m.title);
      expect(titles).not.toContain('Requested');
      expect(titles).toContain('Pending');
      expect(titles).toContain('NoEnrichment');
    });

    it('returns 0 watched movies when there is no enrichment data', async () => {
      const res = await client.get(
        browsePath('movie', [{ ruleKey: 'watched', value: true }], { pageSize: 100 })
      );
      const data = expectSuccessResponse(res);
      expect(data.totalCount).toBe(0);
    });
  });
});
