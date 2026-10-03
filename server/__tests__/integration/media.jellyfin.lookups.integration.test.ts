import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Tests for Jellyfin as an additional producer into the shared csv-strings lookup
 * routes Plex's UI pass already named (studio, file-tech fields, labels) — per the
 * spec, Jellyfin joins these routes rather than minting parallel ones.
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
const JELLYFIN_URL = 'http://localhost:8096';

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

describe('Jellyfin lookup routes — additional producer alongside Plex', () => {
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
      apiKey: 'fake-plex-key',
    });
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.JELLYFIN,
      name: 'Jellyfin',
      url: JELLYFIN_URL,
      apiKey: 'fake-jellyfin-key',
      settings: { userId: 'test-user-id' },
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('GET /api/media/studio merges and dedupes studio values from both Plex and Jellyfin', async () => {
    server.use(
      http.get(`${PLEX_URL}/library/sections`, () =>
        HttpResponse.json({
          MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] },
        })
      ),
      http.get(`${PLEX_URL}/library/sections/:key/all`, () =>
        HttpResponse.json({
          MediaContainer: {
            Metadata: [{ ratingKey: '1', title: 'A', type: 'movie', studio: 'Warner Bros' }],
          },
        })
      ),
      http.get(`${JELLYFIN_URL}/Users/:userId/Items`, () =>
        HttpResponse.json({
          Items: [
            { Id: 'jf-1', Name: 'B', Type: 'Movie', Studios: [{ Name: 'Legendary Pictures' }] },
            { Id: 'jf-2', Name: 'C', Type: 'Movie', Studios: [{ Name: 'Warner Bros' }] },
          ],
          TotalRecordCount: 2,
        })
      )
    );

    const routes = serveApi({ media: createMediaProcedures(cradle).procedures });
    const client = createApiClient(buildAuthedApp(routes));

    const res = await client.get('/api/media/studio');

    expect(expectSuccessResponse(res)).toEqual(['Legendary Pictures', 'Warner Bros']);
  });

  it('GET /api/media/file-resolutions derives a discrete tier from Jellyfin stream height', async () => {
    server.use(
      http.get(`${PLEX_URL}/library/sections`, () =>
        HttpResponse.json({ MediaContainer: { Directory: [] } })
      ),
      http.get(`${JELLYFIN_URL}/Users/:userId/Items`, () =>
        HttpResponse.json({
          Items: [
            {
              Id: 'jf-1',
              Name: 'A',
              Type: 'Movie',
              MediaSources: [{ MediaStreams: [{ Type: 'Video', Codec: 'hevc', Height: 2160 }] }],
            },
          ],
          TotalRecordCount: 1,
        })
      )
    );

    const routes = serveApi({ media: createMediaProcedures(cradle).procedures });
    const client = createApiClient(buildAuthedApp(routes));

    const res = await client.get('/api/media/file-resolutions');

    expect(expectSuccessResponse(res)).toEqual(['2160']);
  });

  it('GET /api/media/labels merges Plex Label tags and Jellyfin Tags into one list', async () => {
    server.use(
      http.get(`${PLEX_URL}/library/sections`, () =>
        HttpResponse.json({
          MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] },
        })
      ),
      http.get(`${PLEX_URL}/library/sections/:key/all`, () =>
        HttpResponse.json({
          MediaContainer: {
            Metadata: [{ ratingKey: '1', title: 'A', type: 'movie', Label: [{ tag: '4K' }] }],
          },
        })
      ),
      http.get(`${JELLYFIN_URL}/Users/:userId/Items`, () =>
        HttpResponse.json({
          Items: [{ Id: 'jf-1', Name: 'B', Type: 'Movie', Tags: ['Favorites'] }],
          TotalRecordCount: 1,
        })
      )
    );

    const routes = serveApi({ media: createMediaProcedures(cradle).procedures });
    const client = createApiClient(buildAuthedApp(routes));

    const res = await client.get('/api/media/labels');

    expect(expectSuccessResponse(res)).toEqual(['4K', 'Favorites']);
  });
});
