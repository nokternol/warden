import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Characterization test: a failed upstream fetch is cached as a partial or empty result.
 *
 * The media fetchers catch a provider's failure and return what the other providers gave
 * (an error entry for browse, an empty list for lookups), and that result is cached like
 * any other until the expiry or a cache event. A provider that recovers by itself shows
 * up only after the expiry; requests during an outage don't each wait on the dead
 * upstream's timeout.
 *
 * The behaviour is deliberate and documented at the cache array in `media.procedures.ts`.
 * Whoever changes it updates that comment, then this test.
 *
 * Requests are compared per fetch, not per call: the HTTP client retries a 500, so one
 * fetch makes several requests.
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
import { server } from '@tests/mocks/server';
import express, { type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RADARR = 'http://localhost:7878/api/v3';
const PLEX = 'http://localhost:32400';

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

/** An upstream that fails until `recover()` is called, counting every request it receives. */
function flakyUpstream(healthy: () => JsonBodyType) {
  const state = { up: false, requests: 0 };
  return {
    state,
    recover: () => {
      state.up = true;
    },
    respond: () => {
      state.requests++;
      return state.up ? HttpResponse.json(healthy()) : new HttpResponse(null, { status: 500 });
    },
  };
}

describe('failed upstream fetches are cached until the expiry', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];
  let media: ReturnType<typeof createMediaProcedures>;
  let client: ReturnType<typeof createApiClient>;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    cradle = buildContainer({ config, db }).cradle;
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: RADARR,
      apiKey: 'fake-key',
    });
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: PLEX,
      apiKey: 'fake-key',
    });
  });

  function freshClient() {
    media = createMediaProcedures(cradle);
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
  }

  afterEach(() => {
    media.dispose();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('Radarr movies: the browse after recovery still shows the error and no titles', async () => {
    const radarr = flakyUpstream(() => [
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
    ]);
    server.use(http.get(`${RADARR}/movie`, radarr.respond));
    freshClient();

    const failed = expectSuccessResponse(await client.get(browsePath('movie')));
    expect(failed.errors.length).toBeGreaterThan(0);
    expect(failed.totalCount).toBe(0);
    const requestsForOneFetch = radarr.state.requests;

    radarr.recover();
    const afterRecovery = expectSuccessResponse(await client.get(browsePath('movie')));

    expect(afterRecovery.errors.length).toBeGreaterThan(0);
    expect(afterRecovery.totalCount).toBe(0);
    expect(radarr.state.requests).toBe(requestsForOneFetch);
  }, 15_000);

  it('Radarr tags: the lookup after recovery is still empty', async () => {
    const radarr = flakyUpstream(() => [{ id: 1, label: 'kids' }]);
    server.use(http.get(`${RADARR}/tag`, radarr.respond));
    freshClient();

    expect(expectSuccessResponse(await client.get('/api/media/tags')).radarr).toEqual([]);
    const requestsForOneFetch = radarr.state.requests;

    radarr.recover();
    const afterRecovery = expectSuccessResponse(await client.get('/api/media/tags'));

    expect(afterRecovery.radarr).toEqual([]);
    expect(radarr.state.requests).toBe(requestsForOneFetch);
  }, 15_000);

  it('Plex studio: the lookup after recovery is still empty, with no error shown', async () => {
    const plex = flakyUpstream(() => ({
      MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] },
    }));
    server.use(
      http.get(`${PLEX}/library/sections`, plex.respond),
      http.get(`${PLEX}/library/sections/:key/all`, () =>
        HttpResponse.json({
          MediaContainer: {
            Metadata: [{ ratingKey: '1', title: 'A', type: 'movie', studio: 'Warner Bros' }],
          },
        })
      )
    );
    freshClient();

    const failed = await client.get('/api/media/studio');
    expect(expectSuccessResponse(failed)).toEqual([]);
    const requestsForOneFetch = plex.state.requests;

    plex.recover();
    const afterRecovery = await client.get('/api/media/studio');

    expect(expectSuccessResponse(afterRecovery)).toEqual([]);
    expect(plex.state.requests).toBe(requestsForOneFetch);
  }, 15_000);
});
