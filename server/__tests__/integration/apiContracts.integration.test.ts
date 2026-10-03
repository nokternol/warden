import { AutomationSchema, MediaQueryRecordSchema, ProviderSchema } from '@contract/schemas';
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { AutomationService } from '@server/modules/automations/automationService';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createSettingsRoutes } from '@server/modules/settings/settings.routes';
import { createMockConfig } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('API shape contracts — real server responses', () => {
  let client: ReturnType<typeof createApiClient>;
  let seededQueryId: number;
  let seededProviderId: number;
  let seededAutomationId: number;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5071,
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
      filterValues: [{ key: 'watched', value: true }],
    });
    const automation = await automationService.create({
      name: 'Test Automation',
      querySources: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });

    seededQueryId = query.id;
    seededProviderId = provider.id;
    seededAutomationId = automation.id;

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ mediaQueries: createMediaQueryProcedures(container.cradle) }));
    app.use(serveApi({ automations: createAutomationProcedures(container.cradle) }));
    app.use('/api/settings', createSettingsRoutes(container.cradle));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // ─── GET responses ──────────────────────────────────────────────────────────

  it('GET /api/media-queries items match MediaQueryRecordSchema', async () => {
    const res = await client.get('/api/media-queries');
    expect(res.status).toBe(200);
    const items = (res.body as { data: unknown[] }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const result = MediaQueryRecordSchema.safeParse(item);
      expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
    }
  });

  it('GET /api/automations items match AutomationSchema', async () => {
    const res = await client.get('/api/automations');
    expect(res.status).toBe(200);
    const items = (res.body as { data: unknown[] }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const result = AutomationSchema.safeParse(item);
      expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
    }
  });

  it('GET /api/settings/providers items match ProviderSchema', async () => {
    const res = await client.get('/api/settings/providers');
    expect(res.status).toBe(200);
    const items = (res.body as { data: unknown[] }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const result = ProviderSchema.safeParse(item);
      expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
    }
  });

  // ─── POST / PATCH responses ─────────────────────────────────────────────────

  it('POST /api/media-queries response matches MediaQueryRecordSchema', async () => {
    const res = await client.post('/api/media-queries', {
      name: 'Contract test query',
      contentType: 'show',
      filterValues: [{ key: 'monitored', value: true }],
    });
    expect(res.status).toBe(200);
    const result = MediaQueryRecordSchema.safeParse((res.body as { data: unknown }).data);
    expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
  });

  it('POST /api/automations response matches AutomationSchema', async () => {
    const res = await client.post('/api/automations', {
      name: 'Contract test automation',
      queryId: seededQueryId,
      providerId: seededProviderId,
      taskId: 'unmonitorMovie',
      schedule: '0 3 * * *',
    });
    expect(res.status).toBe(200);
    const result = AutomationSchema.safeParse((res.body as { data: unknown }).data);
    expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
  });

  it('PATCH /api/automations/:id/status response matches AutomationSchema', async () => {
    const res = await client.patch(`/api/automations/${seededAutomationId}/status`, {
      status: 'paused',
    });
    expect(res.status).toBe(200);
    const result = AutomationSchema.safeParse((res.body as { data: unknown }).data);
    expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
  });

  it('POST /api/settings/providers response matches ProviderSchema', async () => {
    const res = await client.post('/api/settings/providers', {
      type: 'SONARR',
      name: 'Contract test Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'test-key',
    });
    expect(res.status).toBe(200);
    const result = ProviderSchema.safeParse((res.body as { data: unknown }).data);
    expect(result.success, JSON.stringify(result.error?.format())).toBe(true);
  });
});
