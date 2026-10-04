import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
/**
 * Integration tests: provider mutations bust all media caches.
 *
 * The providers and media procedures share the same cradle.
 * `createMediaProcedures()` returns an `invalidateMediaCaches` function
 * alongside the procedures. That function is passed into the providers
 * procedures so update and delete can call it.
 *
 * Run: vitest run --project server
 */
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeRadarrMovie(title: string, id = 1) {
  return {
    id,
    title,
    hasFile: true,
    monitored: true,
    tmdbId: 603,
    qualityProfileId: 1,
    tags: [],
    path: `/movies/${title}`,
  };
}

// ---------------------------------------------------------------------------

describe('Provider mutation cache invalidation', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];
  let app: Express;
  let client: ReturnType<typeof createApiClient>;
  let providerId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;

    // Seed a Radarr provider
    const provider = await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
    providerId = provider.id;
  });

  beforeEach(() => {
    // Build fresh media procedures per test so caches start empty. They expose
    // `invalidateMediaCaches`, which is passed to the providers
    // procedures so provider mutations can bust stale data.
    const media = createMediaProcedures(cradle);
    const { invalidateMediaCaches } = media;

    // Providers procedures get the invalidator injected as second argument
    const providersProcedures = createProvidersProcedures(cradle, invalidateMediaCaches);

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = MOCK_USER;
      next();
    });
    app.use(serveApi({ media: media.procedures, providers: providersProcedures }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // -------------------------------------------------------------------------

  it('PATCH /providers/:id invalidates the movies cache so the next GET /media/movies re-fetches from Radarr', async () => {
    let radarrCallCount = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => {
        radarrCallCount++;
        return HttpResponse.json([makeRadarrMovie('The Matrix', radarrCallCount)]);
      })
    );

    // Warm the cache
    await client.get(browsePath('movie'));
    expect(radarrCallCount).toBe(1);

    // Mutate the provider — should bust all media caches
    await client.patch(`/api/providers/${providerId}`, { name: 'Radarr Updated' });

    // Next media fetch must bypass cache and hit Radarr again
    const res = await client.get(browsePath('movie'));
    const data = expectSuccessResponse(res);

    expect(radarrCallCount).toBe(2);
    expect(data.items).toHaveLength(1);
  }, 15_000);

  it('DELETE /providers/:id invalidates the movies cache so the next GET /media/movies re-fetches from Radarr', async () => {
    // Seed a second provider so we can delete it without removing the main one.
    // Inactive since its activation state is irrelevant to the cache-invalidation
    // behaviour under test (a second active Radarr instance is also legal — D8's
    // single-active invariant no longer applies to MediaSource-role types).
    const extra = await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr Extra',
      url: 'http://localhost:7879/api/v3',
      apiKey: 'fake-key-2',
      isActive: false,
    });

    let radarrCallCount = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () => {
        radarrCallCount++;
        return HttpResponse.json([makeRadarrMovie('Inception', radarrCallCount)]);
      }),
      // Extra provider returns empty to keep counts clean
      http.get('http://localhost:7879/api/v3/movie', () => HttpResponse.json([]))
    );

    // Warm the cache
    await client.get(browsePath('movie'));
    expect(radarrCallCount).toBe(1);

    // Delete the extra provider — should bust all media caches
    await client.delete(`/api/providers/${extra.id}`);

    // Next media fetch must bypass cache and hit Radarr again
    const res = await client.get(browsePath('movie'));
    const data = expectSuccessResponse(res);

    expect(radarrCallCount).toBe(2);
    expect(data.items).toHaveLength(1);
  }, 15_000);
});
