import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Integration test: an automation that changes titles clears the media caches.
 *
 * The automation executor sends `media:changed` once a task declaring
 * `affects: 'media'` has acted; the media procedures, built on the same
 * container and so the same event bus, clear their caches on it. The next
 * browse refetches from Radarr and shows the change.
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
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

const RADARR = 'http://localhost:7878/api/v3';

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

describe('media caches after an automation run', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    cradle = buildContainer({ config, db }).cradle;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('an unmonitor run makes the next browse refetch and show the titles unmonitored', async () => {
    // A stateful Radarr: PUT /movie/:id stores the edit, GET /movie serves the current state.
    const movies = new Map([
      [
        1,
        {
          id: 1,
          title: 'Inception',
          hasFile: true,
          monitored: true,
          tmdbId: 27205,
          qualityProfileId: 1,
          tags: [],
          path: '/movies/Inception',
        },
      ],
    ]);
    let browseFetches = 0;
    server.use(
      http.get(`${RADARR}/movie`, () => {
        browseFetches++;
        return HttpResponse.json([...movies.values()]);
      }),
      http.put(`${RADARR}/movie/:id`, async ({ params, request }) => {
        const body = (await request.json()) as { monitored: boolean };
        const movie = movies.get(Number(params.id))!;
        movies.set(movie.id, { ...movie, monitored: body.monitored });
        return HttpResponse.json(movies.get(movie.id));
      })
    );

    const provider = await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: RADARR,
      apiKey: 'fake-key',
      settings: { enabledTasks: ['unmonitorMovie'] },
    });
    const query = await cradle.mediaQueryService.create({
      name: 'Everything',
      contentType: 'movie',
      filters: [],
    });
    const automation = await cradle.automationService.create({
      name: 'Unmonitor everything',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 * * * *',
    });

    const media = createMediaProcedures(cradle);
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = MOCK_USER;
      next();
    });
    app.use('/api/media', serveApi({ media: media.procedures }));
    app.use(errorHandlerMiddleware);
    const client = createApiClient(app);

    const before = expectSuccessResponse(await client.get(browsePath('movie')));
    expect(before.items[0].monitored).toBe(true);

    await cradle.automationExecutor.execute(automation.id);
    const fetchesBeforeBrowse = browseFetches;

    const after = expectSuccessResponse(await client.get(browsePath('movie')));
    expect(browseFetches).toBe(fetchesBeforeBrowse + 1);
    expect(after.items[0].monitored).toBe(false);

    media.dispose();
  }, 15_000);
});
