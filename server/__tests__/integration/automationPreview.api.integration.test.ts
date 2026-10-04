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
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878/api/v3';

describe('POST /api/automations/preview', () => {
  let client: ReturnType<typeof createApiClient>;
  let radarrId: number;
  let hasFileQueryId: number;

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

    const radarr = await new ProviderSettingsService({ db }).create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: RADARR_URL,
      apiKey: 'test-key',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    radarrId = radarr.id;

    const hasFileQuery = await new MediaQueryService({ db }).create({
      name: 'On disk',
      contentType: 'movie',
      filters: [{ ruleKey: 'hasFile', value: true }],
    });
    hasFileQueryId = hasFileQuery.id;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ automations: createAutomationProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterEach(() => {
    server.resetHandlers();
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

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 2, contentType: 'movie' });
  });

  it('answers 404 for an unknown provider', async () => {
    const res = await client.post('/api/automations/preview', {
      providerId: 999999,
      taskId: 'deleteMovieWithFiles',
      queries: [{ queryId: hasFileQueryId, role: 'include' }],
    });

    expect(res.status).toBe(404);
  });
});
