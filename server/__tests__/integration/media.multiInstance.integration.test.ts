import { buildContainer } from '@server/container';
/**
 * Phase 6 — end-to-end verification that a second active Radarr instance is now
 * reachable and flows correctly through identity resolution, grouping, and preview
 * fan-out (tickets 2-5), now that the single-active invariant is relaxed for
 * MediaSource-role types (ticket 6).
 *
 * Run: vitest run --project server
 */
import { MetadataProviderType, mediaIdentity, mediaItems } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import type { DrizzleDb } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { createMockConfig, createRadarrMovie, createSonarrSeries } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';
const RADARR_4K_URL = 'http://localhost:7879';
const SONARR_URL = 'http://localhost:8989';

describe('Multi-instance Radarr — identity resolution + preview fan-out', () => {
  let db: DrizzleDb;
  let container: ReturnType<typeof buildContainer>;
  let client: ReturnType<typeof createApiClient>;
  let radarrId: number;
  let radarr4kId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5094,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    db = await initializeDatabase(config);
    container = buildContainer({ config, db });

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
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: `${SONARR_URL}/api/v3`,
      apiKey: 'key-3',
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

  it('configuring a second active Radarr instance succeeds', async () => {
    // Asserted by beforeAll not throwing — both instances are active.
    expect(radarrId).not.toBe(radarr4kId);
  });

  it('the identity job resolves both instances into media_item, sharing one group for a shared tmdbId', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'The Matrix', tmdbId: 603 })])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 55, title: 'The Matrix 4K', tmdbId: 603 })])
      )
    );

    const job = await container.cradle.identityJobFactory.create();
    const count = await job.runForMovies();

    expect(count).toBe(2);
    const identities = await db.select().from(mediaIdentity);
    expect(identities).toHaveLength(1); // shared tmdbId → one group
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.providerId).sort()).toEqual([radarrId, radarr4kId].sort());
  });

  async function previewOf(contentType: 'movie' | 'series'): Promise<unknown> {
    const mediaQueryService = new MediaQueryService({
      db,
      filterReadiness: filterReadinessOver(db),
    });
    const query = await mediaQueryService.create({
      name: `Everything ${contentType} ${Math.random()}`,
      contentType,
      filters: [],
    });
    return expectSuccessResponse(await client.get(`/api/media-queries/${query.id}/preview`));
  }

  it('preview counts one title for copies sharing a TMDB id on two instances, and two for different ids', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          createRadarrMovie({ id: 1, title: 'Alpha', tmdbId: 100 }),
          createRadarrMovie({ id: 2, title: 'Beta', tmdbId: 200 }),
        ])
      ),
      http.get(`${RADARR_4K_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'Alpha 4K', tmdbId: 100 })])
      )
    );

    expect(await previewOf('movie')).toEqual({ count: 2 });
  });

  it('preview counts each series Sonarr reports with a TVDB id of 0 as its own title', async () => {
    server.use(
      http.get(`${SONARR_URL}/api/v3/series`, () =>
        HttpResponse.json([
          createSonarrSeries({ id: 1, title: 'Unlisted A', tvdbId: 0 }),
          createSonarrSeries({ id: 2, title: 'Unlisted B', tvdbId: 0 }),
        ])
      )
    );

    expect(await previewOf('series')).toEqual({ count: 2 });
  });
});
