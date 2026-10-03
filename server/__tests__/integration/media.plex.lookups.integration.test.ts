import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Tests for Plex-sourced csv-strings lookup routes (studio, and its siblings as they
 * land) — the options source `FilterPicker`'s add-filter controls resolve against.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

const PLEX_URL = 'http://localhost:32400';

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

describe('Plex lookup routes', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];

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
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: PLEX_URL,
      apiKey: 'fake-key',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('GET /api/media/studio returns the deduped, sorted studio list across Plex libraries', async () => {
    server.use(
      http.get(`${PLEX_URL}/library/sections`, () =>
        HttpResponse.json({
          MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] },
        })
      ),
      http.get(`${PLEX_URL}/library/sections/:key/all`, () =>
        HttpResponse.json({
          MediaContainer: {
            Metadata: [
              { ratingKey: '1', title: 'A', type: 'movie', studio: 'Legendary Pictures' },
              { ratingKey: '2', title: 'B', type: 'movie', studio: 'Warner Bros' },
              { ratingKey: '3', title: 'C', type: 'movie', studio: 'Legendary Pictures' },
              { ratingKey: '4', title: 'D', type: 'movie' },
            ],
          },
        })
      )
    );

    const routes = serveApi({ media: createMediaProcedures(cradle).procedures });
    const client = createApiClient(buildAuthedApp(routes));

    const res = await client.get('/api/media/studio');

    expect(expectSuccessResponse(res)).toEqual(['Legendary Pictures', 'Warner Bros']);
  });
});
