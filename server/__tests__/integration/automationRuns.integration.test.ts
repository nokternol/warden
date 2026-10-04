import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Automation Runs API Integration Tests
 *
 * Tests GET /api/automations/runs via the real automations router.
 * Auth is bypassed by injecting a fake session middleware before mounting.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import type { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/automations/runs', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;
  let runService: AutomationRunService;
  let automationId: number;
  let providerId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5057,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });

    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    // Seed fixtures
    const providerService = new ProviderSettingsService({ db });
    const mediaQueryService = new MediaQueryService({ db });
    const automationService = new AutomationService({ db });

    const provider = await providerService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
    });
    const query = await mediaQueryService.create({
      name: 'Test Query',
      contentType: 'movie',
      filters: [],
    });
    const automation = await automationService.create({
      name: 'Nightly Cleanup',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });
    automationId = automation.id;
    providerId = provider.id;
    runService = container.cradle.automationRunService;

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    // Inject a fake user so the contract's default-deny check passes
    app.use((req, _res, next) => {
      req.user = { id: 1, email: 'test@example.com' } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ automations: createAutomationProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('returns empty data array when no runs exist', async () => {
    const res = await client.get('/api/automations/runs');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.data).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  it('returns runs with correct shape', async () => {
    await runService.createRun({ automationId, status: 'success', itemCount: 5 });

    const res = await client.get('/api/automations/runs');
    expect(res.status).toBe(200);
    const { data } = res.body.data;
    expect(data[0]).toMatchObject({
      automationId,
      automationName: 'Nightly Cleanup',
      status: 'success',
      itemCount: 5,
    });
  });

  it('filters by automationId query param', async () => {
    const res = await client.get(`/api/automations/runs?automationId=${automationId}`);
    expect(res.status).toBe(200);
    const { data } = res.body.data;
    for (const r of data) {
      expect(r.automationId).toBe(automationId);
    }
  });

  it('respects limit query param', async () => {
    await runService.createRun({ automationId, status: 'success' });
    await runService.createRun({ automationId, status: 'error' });

    const res = await client.get('/api/automations/runs?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data.data).toHaveLength(1);
  });

  it("serves a run's targeted items page by page", async () => {
    const run = await runService.createRun({
      automationId,
      status: 'success',
      targets: {
        contentType: 'movie',
        items: ['Heat', 'Alien', 'Ronin'].map((title, i) => ({
          _sourceIds: { radarr: 900 + i, providerId, tmdb: 9000 + i },
          title,
          year: 1990 + i,
        })),
      },
    });

    const res = await client.get(`/api/automations/runs/${run.id}/items?limit=2&offset=1`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.data).toEqual([
      { mediaItemId: expect.any(Number), title: 'Heat', year: 1990, deleted: false },
      { mediaItemId: expect.any(Number), title: 'Ronin', year: 1992, deleted: false },
    ]);
  });
});
