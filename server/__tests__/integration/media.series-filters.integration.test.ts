import { buildContainer } from '@server/container';
import {
  MetadataProviderType,
  mediaEnrichment,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
/**
 * Phase 2 — series browse predicates delegated to the registry.
 *
 * Mirrors the movie coverage for the show content type: previously-stripped
 * non-enriched predicates (certification, added-days, size, community rating,
 * ended, last-aired, episode completion) and the enriched predicates the
 * parallel engine never declared. Series-specific client param names
 * (sonarrRating*, sonarrEnded, sonarrLastAired*, sonarrPercentEpisodes*) bridge
 * to their registry keys.
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
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

const GB = 1_073_741_824;
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function series(
  id: number,
  title: string,
  extra: Record<string, unknown>
): Record<string, unknown> {
  return {
    id,
    title,
    year: 2010,
    status: 'ended',
    monitored: true,
    tvdbId: id,
    qualityProfileId: 1,
    tags: [],
    genres: [],
    network: 'HBO',
    seriesType: 'standard',
    path: `/tv/${id}`,
    seasons: [],
    ...extra,
  };
}

describe('Media browse — series registry predicates', () => {
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
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'fake-key',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.delete(mediaEnrichment);
    await db.delete(mediaIdentity);
  });

  // Fresh routes per call → isolated MediaCache.
  function clientWithSeries(list: unknown[]): ReturnType<typeof createApiClient> {
    server.use(http.get('http://localhost:8989/api/v3/series', () => HttpResponse.json(list)));
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

  async function seedEnrichment(
    sourceId: number,
    fields: Partial<EnrichmentFields>
  ): Promise<void> {
    const db = getDb();
    const [sonarr] = await db
      .select({ id: metadataProviders.id })
      .from(metadataProviders)
      .where(eq(metadataProviders.type, MetadataProviderType.SONARR));
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'show', enrichedAt: Math.floor(Date.now() / 1000) })
      .returning();
    await db
      .insert(mediaItems)
      .values({ providerId: sonarr.id, externalId: sourceId, mediaIdentityId: identity.id });
    await new EnrichmentQueries({ db }).replaceFields(identity.id, fields);
  }

  describe('certification', () => {
    it('returns only series whose certification matches', async () => {
      const client = clientWithSeries([
        series(1, 'TV-MA Show', { certification: 'TV-MA' }),
        series(2, 'TV-14 Show', { certification: 'TV-14' }),
      ]);
      const res = await client.get('/api/media/series?certification=TV-MA&pageSize=100');
      const data = expectSuccessResponse(res);
      expect(data.items.map((s: { title: string }) => s.title)).toEqual(['TV-MA Show']);
    });
  });

  describe('addedDaysAgo range', () => {
    const list = [
      series(1, 'Old', { added: daysAgoIso(10) }),
      series(2, 'New', { added: daysAgoIso(2) }),
    ];
    it('filters by added at least N days ago', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?addedDaysAgoGte=7&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Old',
      ]);
    });
    it('filters by added at most N days ago', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?addedDaysAgoLte=7&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'New',
      ]);
    });
  });

  describe('sizeOnDiskGb range', () => {
    const list = [
      series(1, 'Small', { statistics: { sizeOnDisk: 1 * GB } }),
      series(2, 'Large', { statistics: { sizeOnDisk: 50 * GB } }),
    ];
    it('filters by at least N GB', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sizeOnDiskGbGte=10&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Large',
      ]);
    });
    it('filters by at most N GB', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sizeOnDiskGbLte=10&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Small',
      ]);
    });
  });

  describe('sonarrRating range (→ communityRating)', () => {
    const list = [
      series(1, 'Low', { ratings: { votes: 100, value: 4.5 } }),
      series(2, 'High', { ratings: { votes: 100, value: 8.5 } }),
    ];
    it('filters by community rating at least N', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrRatingGte=7&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'High',
      ]);
    });
    it('filters by community rating at most N', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrRatingLte=7&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Low',
      ]);
    });
  });

  describe('sonarrEnded (→ ended)', () => {
    it('filters to ended series', async () => {
      const client = clientWithSeries([
        series(1, 'Ended', { ended: true }),
        series(2, 'Running', { ended: false }),
      ]);
      const res = await client.get('/api/media/series?sonarrEnded=true&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Ended',
      ]);
    });
  });

  describe('sonarrLastAiredDaysAgo range (→ lastAiredDaysAgo)', () => {
    const list = [
      series(1, 'StaleAir', { previousAiring: daysAgoIso(40) }),
      series(2, 'FreshAir', { previousAiring: daysAgoIso(3) }),
    ];
    it('filters by last aired at least N days ago', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrLastAiredDaysAgoGte=30&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'StaleAir',
      ]);
    });
    it('filters by last aired at most N days ago', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrLastAiredDaysAgoLte=30&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'FreshAir',
      ]);
    });
  });

  describe('sonarrPercentEpisodes range (→ episodePercentage)', () => {
    const list = [
      series(1, 'Partial', { statistics: { sizeOnDisk: 0, percentOfEpisodes: 40 } }),
      series(2, 'Complete', { statistics: { sizeOnDisk: 0, percentOfEpisodes: 100 } }),
    ];
    it('filters by episode completion at least N%', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrPercentEpisodesGte=90&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Complete',
      ]);
    });
    it('filters by episode completion at most N%', async () => {
      const client = clientWithSeries(list);
      const res = await client.get('/api/media/series?sonarrPercentEpisodesLte=90&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Partial',
      ]);
    });
  });

  describe('enriched predicates (overseerr / tmdbStatus / lastWatched) on series', () => {
    it('overseerrRequestStatus narrows by merged SONARR enrichment', async () => {
      const client = clientWithSeries([series(1, 'Requested', {}), series(2, 'Other', {})]);
      await seedEnrichment(1, { overseerrRequestStatus: 2 });
      await seedEnrichment(2, { overseerrRequestStatus: 1 });
      const res = await client.get('/api/media/series?overseerrRequestStatus=2&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Requested',
      ]);
    });

    it('tmdbStatus narrows by merged SONARR enrichment', async () => {
      const client = clientWithSeries([series(1, 'Ended TV', {}), series(2, 'Returning TV', {})]);
      await seedEnrichment(1, { tmdbStatus: 'Ended' });
      await seedEnrichment(2, { tmdbStatus: 'Returning Series' });
      const res = await client.get('/api/media/series?tmdbStatus=Ended&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Ended TV',
      ]);
    });

    it('returns 0 series when an enriched filter has no enrichment data', async () => {
      const client = clientWithSeries([series(1, 'A', {}), series(2, 'B', {})]);
      const res = await client.get('/api/media/series?overseerrRequestStatus=2&pageSize=100');
      expect(expectSuccessResponse(res).totalCount).toBe(0);
    });
  });

  describe('tautulliWatched (migrated to enrichment playCount)', () => {
    it('returns only series with enriched playCount > 0 when tautulliWatched=true', async () => {
      const client = clientWithSeries([series(1, 'Watched', {}), series(2, 'Unwatched', {})]);
      await seedEnrichment(1, { playCount: 5 });
      await seedEnrichment(2, { playCount: 0 });
      const res = await client.get('/api/media/series?tautulliWatched=true&pageSize=100');
      expect(expectSuccessResponse(res).items.map((s: { title: string }) => s.title)).toEqual([
        'Watched',
      ]);
    });
  });
});
