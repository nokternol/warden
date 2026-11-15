import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Tests for observable cache lifecycle behaviour in MediaHandler.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig, createSonarrSeries } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

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

function buildAuthedApp(routes: ReturnType<typeof serveApi>): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    _req.user = MOCK_USER;
    next();
  });
  app.use('/api/media', routes);
  app.use(errorHandlerMiddleware);
  return app;
}

// --------------------------------------------------------------------------

describe('MediaHandler cache lifecycle', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  // Each build subscribes to the shared bus; dispose them so listeners don't pile up across tests.
  const builtMedia: Array<{ dispose(): void }> = [];
  function buildMedia() {
    const media = createMediaProcedures(cradle);
    builtMedia.push(media);
    return media;
  }
  afterEach(() => {
    for (const media of builtMedia.splice(0)) media.dispose();
    // The container's one read cache outlives each test; each test sets its own upstream answers.
    cradle.sourceReadCache.clear();
  });

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;

    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
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

  it("after dispose(), media:changed no longer clears that instance's lookup caches", async () => {
    let tagCalls = 0;
    server.use(
      http.get('http://localhost:7878/api/v3/tag', () => {
        tagCalls++;
        return HttpResponse.json([{ id: 1, label: 'action' }]);
      }),
      http.get('http://localhost:8989/api/v3/tag', () => HttpResponse.json([]))
    );
    const media = buildMedia();
    const client = createApiClient(buildAuthedApp(serveApi({ media: media.procedures })));

    await client.get('/api/media/tags');
    media.dispose();
    cradle.eventBus.emit('media:changed', {});
    await client.get('/api/media/tags');

    expect(tagCalls).toBe(1);
  });
});
