/**
 * POST /api/automations/preview — what an unsaved automation would act on,
 * resolved the way a run resolves its targets, without running anything.
 */
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { refreshCatalog } from '@tests/helpers/library';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878/api/v3';

describe('POST /api/automations/preview', () => {
  let client: ReturnType<typeof createApiClient>;
  let radarrId: number;
  let hasFileQueryId: number;
  let lowImdbQueryId: number;
  let cradle: ReturnType<typeof buildContainer>['cradle'];

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
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;

    const radarr = await new ProviderSettingsService({ db }).create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: RADARR_URL,
      apiKey: 'test-key',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    radarrId = radarr.id;

    const mediaQueries = new MediaQueryService({ db, filterReadiness: filterReadinessOver(db) });
    const hasFileQuery = await mediaQueries.create({
      name: 'On disk',
      contentType: 'movie',
      filters: [{ ruleKey: 'hasFile', value: true }],
    });
    hasFileQueryId = hasFileQuery.id;
    const lowImdbQuery = await mediaQueries.create({
      name: 'IMDb rating at most 5',
      contentType: 'movie',
      filters: [{ ruleKey: 'imdbRating', value: { max: 5 } }],
    });
    lowImdbQueryId = lowImdbQuery.id;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(
      serveApi({
        automations: createAutomationProcedures(container.cradle),
        mediaQueries: createMediaQueryProcedures(container.cradle),
      })
    );
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterEach(() => {
    server.resetHandlers();
    // The container's one read cache outlives each test; each test sets its own upstream answers.
    cradle.sourceReadCache.clear();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  function radarrHolds(movies: ReturnType<typeof createRadarrMovie>[]) {
    server.use(http.get(`${RADARR_URL}/movie`, () => HttpResponse.json(movies)));
  }

  it('answers how many movies an unsaved automation would act on', async () => {
    radarrHolds([
      createRadarrMovie({ id: 1, title: 'Alien', hasFile: true }),
      createRadarrMovie({ id: 2, title: 'Brazil', hasFile: false }),
      createRadarrMovie({ id: 3, title: 'Heat', hasFile: true }),
    ]);

    const res = await client.post('/api/automations/preview', {
      providerId: radarrId,
      taskId: 'deleteMovieWithFiles',
      queries: [{ queryId: hasFileQueryId, role: 'include' }],
    });

    expectSuccessResponse(res, { count: 2, contentType: 'movie' });
  });

  it('does not let a rating exclusion protect an unrated movie', async () => {
    radarrHolds([
      createRadarrMovie({
        id: 1,
        title: 'Unrated',
        ratings: { imdb: { value: 0, votes: 0, type: 'user' } },
      }),
      createRadarrMovie({
        id: 2,
        title: 'Rated',
        ratings: { imdb: { value: 8, votes: 900, type: 'user' } },
      }),
    ]);

    const res = await client.post('/api/automations/preview', {
      providerId: radarrId,
      taskId: 'deleteMovieWithFiles',
      queries: [
        { queryId: hasFileQueryId, role: 'include' },
        { queryId: lowImdbQueryId, role: 'exclude' },
      ],
    });

    expectSuccessResponse(res, { count: 2, contentType: 'movie' });
  });

  it('answers 404 for an unknown provider', async () => {
    const res = await client.post('/api/automations/preview', {
      providerId: 999999,
      taskId: 'deleteMovieWithFiles',
      queries: [{ queryId: hasFileQueryId, role: 'include' }],
    });

    expectErrorResponse(res, 404, 'NOT_FOUND');
  });

  it('answers 400 for a task not enabled on the provider instance', async () => {
    const res = await client.post('/api/automations/preview', {
      providerId: radarrId,
      taskId: 'unmonitorMovie',
      queries: [{ queryId: hasFileQueryId, role: 'include' }],
    });

    expectErrorResponse(res, 400, 'VALIDATION_ERROR');
  });

  it('answers 400 for a draft with no included query', async () => {
    const res = await client.post('/api/automations/preview', {
      providerId: radarrId,
      taskId: 'deleteMovieWithFiles',
      queries: [{ queryId: hasFileQueryId, role: 'exclude' }],
    });

    expectErrorResponse(res, 400, 'VALIDATION_ERROR');
  });

  it("a query preview and an automation's planning match the same titles", async () => {
    server.use(
      http.get(`${RADARR_URL}/movie`, () => {
        return HttpResponse.json([
          createRadarrMovie({ id: 1, title: 'Alien', hasFile: true }),
          createRadarrMovie({ id: 2, title: 'Brazil', hasFile: false }),
          createRadarrMovie({ id: 3, title: 'Heat', hasFile: true }),
        ]);
      })
    );

    await refreshCatalog(cradle);
    const queryPreview = expectSuccessResponse(
      await client.get(`/api/media-queries/${hasFileQueryId}/preview`)
    );
    const automationPreview = expectSuccessResponse(
      await client.post('/api/automations/preview', {
        providerId: radarrId,
        taskId: 'deleteMovieWithFiles',
        queries: [{ queryId: hasFileQueryId, role: 'include' }],
      })
    );

    expect(automationPreview.count).toBe(queryPreview.count);
  });

  it('readiness with fresh re-reads the library; without it, reads it as it stands', async () => {
    let library = [createRadarrMovie({ id: 1, title: 'Alien', hasFile: true })];
    server.use(http.get(`${RADARR_URL}/movie`, () => HttpResponse.json(library)));
    const automation = await cradle.automationService.create({
      name: 'Delete what is on disk',
      queries: [{ queryId: hasFileQueryId, role: 'include' }],
      providerId: radarrId,
      taskId: 'deleteMovieWithFiles',
      schedule: '0 * * * *',
    });
    const readiness = async (query = '') =>
      expectSuccessResponse(await client.get(`/api/automations/${automation.id}/readiness${query}`))
        .count;

    await readiness();
    library = [...library, createRadarrMovie({ id: 2, title: 'Heat', hasFile: true })];

    expect({ asItStands: await readiness(), fresh: await readiness('?fresh=true') }).toEqual({
      asItStands: 1,
      fresh: 2,
    });
  });
});
