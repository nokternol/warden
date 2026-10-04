import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * POST /api/automations — Session C API integration tests
 * Cycles 9–11: queries array, cross-type rejection, legacy queryId conversion
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('POST /api/automations — Session C', () => {
  let client: ReturnType<typeof createApiClient>;
  let movieProviderId: number;
  let movieQueryId: number;
  let showQueryId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5092,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    const providerService = new ProviderSettingsService({ db });
    const mediaQueryService = new MediaQueryService({ db });

    const provider = await providerService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
    });
    movieProviderId = provider.id;

    const movieQuery = await mediaQueryService.create({
      name: 'Movie Query',
      contentType: 'movie',
      filterValues: [],
    });
    movieQueryId = movieQuery.id;

    const showQuery = await mediaQueryService.create({
      name: 'Show Query',
      contentType: 'series',
      filterValues: [],
    });
    showQueryId = showQuery.id;

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

  afterAll(async () => {
    await closeDatabase();
  });

  // ─── Cycle 9 ────────────────────────────────────────────────────────────────

  it('Cycle 9: queries array creates automation and returns sources in response', async () => {
    const res = await client.post('/api/automations', {
      name: 'Multi-query automation',
      providerId: movieProviderId,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
      queries: [{ queryId: movieQueryId, role: 'include', sortOrder: 0 }],
    });

    expect(res.status).toBe(200);
    const data = (res.body as { data: { queries: unknown[] } }).data;
    expect(data.queries).toEqual([{ queryId: movieQueryId, role: 'include', sortOrder: 0 }]);
  });

  // ─── Cycle 10 ───────────────────────────────────────────────────────────────

  it('Cycle 10: cross-type queries (movie + show) returns 400', async () => {
    const res = await client.post('/api/automations', {
      name: 'Cross-type automation',
      providerId: movieProviderId,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
      queries: [
        { queryId: movieQueryId, role: 'include', sortOrder: 0 },
        { queryId: showQueryId, role: 'exclude', sortOrder: 1 },
      ],
    });

    expect(res.status).toBe(400);
  });

  // ─── taskId manifest validation ───────────────────────────────────────────────

  it('rejects a taskId absent from the bound provider manifest', async () => {
    const res = await client.post('/api/automations', {
      name: 'Unrunnable task automation',
      providerId: movieProviderId,
      taskId: 'radarr.deleteUnmonitored',
      schedule: '0 2 * * *',
      queries: [{ queryId: movieQueryId, role: 'include', sortOrder: 0 }],
    });

    expect(res.status).toBe(400);
  });

  // ─── Cycle 11 ───────────────────────────────────────────────────────────────

  it('Cycle 11: legacy queryId converts to single included query in response', async () => {
    const res = await client.post('/api/automations', {
      name: 'Legacy automation',
      providerId: movieProviderId,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
      queryId: movieQueryId,
    });

    expect(res.status).toBe(200);
    const data = (res.body as { data: { queries: unknown[] } }).data;
    expect(data.queries).toEqual([{ queryId: movieQueryId, role: 'include', sortOrder: 0 }]);
  });
});
