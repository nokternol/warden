import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('serveApi — the contract served over HTTP', () => {
  let app: Express;
  let anonymousApp: Express;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5093,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    const provider = await new ProviderSettingsService({ db }).create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'test-key',
      settings: { enabledTasks: ['unmonitorMovie'] },
    });
    const query = await new MediaQueryService({ db }).create({
      name: 'Movies',
      contentType: 'movie',
      filterValues: [],
    });
    await new AutomationService({ db }).create({
      name: 'Nightly unmonitor',
      querySources: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });

    const router = { automations: createAutomationProcedures(container.cradle) };
    const buildApp = (signedIn: boolean) => {
      const built = express();
      built.use(express.json());
      built.use(requestIdMiddleware);
      if (signedIn) {
        built.use((req, _res, next) => {
          req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
          next();
        });
      }
      built.use(serveApi(router));
      return built;
    };
    app = buildApp(true);
    anonymousApp = buildApp(false);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('answers a contract procedure at its declared method and path inside the success envelope', async () => {
    const res = await request(app).get('/api/automations');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: [expect.objectContaining({ name: 'Nightly unmonitor', taskId: 'unmonitorMovie' })],
    });
  });

  it('refuses a procedure that is not public when no user is signed in', async () => {
    const res = await request(anonymousApp).get('/api/automations');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      status: 'error',
      error: { type: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('answers an application error thrown by a procedure with its status inside the error envelope', async () => {
    const res = await request(app).post('/api/automations/9999/run');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      error: { type: 'NOT_FOUND', message: 'Automation 9999 not found' },
    });
  });
});
