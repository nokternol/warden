import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { api, serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { AppError } from '@server/kernel/errors';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAutomationProcedures } from '@server/modules/automations';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  http: vi.fn(),
}));
vi.mock('@server/kernel/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/kernel/logger')>();
  return {
    ...actual,
    getChildLogger: (name: string) => (name === 'Api' ? apiLog : actual.getChildLogger(name)),
  };
});

describe('serveApi — the contract served over HTTP', () => {
  let app: Express;
  let anonymousApp: Express;
  let bypassedApp: Express;

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
      filters: [],
    });
    await new AutomationService({ db }).create({
      name: 'Nightly unmonitor',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'unmonitorMovie',
      schedule: '0 2 * * *',
    });

    const router = { automations: createAutomationProcedures(container.cradle) };
    const buildApp = (signedIn: boolean, options?: Parameters<typeof serveApi>[1]) => {
      const built = express();
      built.use(express.json());
      built.use(requestIdMiddleware);
      if (signedIn) {
        built.use((req, _res, next) => {
          req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
          next();
        });
      }
      built.use(serveApi(router, options));
      return built;
    };
    app = buildApp(true);
    anonymousApp = buildApp(false);
    bypassedApp = buildApp(false, { authBypass: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    apiLog.error.mockClear();
    apiLog.warn.mockClear();
  });

  /** An app whose `automations.list` handler is replaced, signed in. */
  const withListHandler = (handler: () => unknown) => {
    const built = express();
    built.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    built.use(
      serveApi({
        automations: { list: api.automations.list.handler(handler as never) },
      })
    );
    return built;
  };

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

  it('answers a procedure that is not public without a signed-in user when auth is bypassed', async () => {
    const res = await request(bypassedApp).get('/api/automations');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ name: 'Nightly unmonitor' })]);
  });

  it('answers an application error thrown by a procedure with its status inside the error envelope', async () => {
    const res = await request(app).post('/api/automations/9999/run');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      error: { type: 'NOT_FOUND', message: 'Automation 9999 not found' },
    });
  });

  it('answers an unexpected error with 500 INTERNAL_ERROR, naming the cause outside production', async () => {
    const failing = express();
    failing.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    failing.use(
      serveApi({
        automations: {
          list: api.automations.list.handler(() => {
            throw new Error('database unavailable');
          }),
        },
      })
    );

    const res = await request(failing).get('/api/automations');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 'error',
      error: { type: 'INTERNAL_ERROR', message: 'database unavailable' },
    });
  });

  it('answers input that fails the contract schema with 400 VALIDATION_ERROR and its field errors', async () => {
    const res = await request(app).post('/api/automations/not-a-number/run');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      status: 'error',
      error: {
        type: 'VALIDATION_ERROR',
        message: 'Invalid input',
        errors: { id: [expect.any(String)] },
      },
    });
  });

  it('logs an application error with a server-side status as an error', async () => {
    const res = await request(
      withListHandler(() => {
        throw new AppError('Upstream unavailable', 503, 'SERVICE_UNAVAILABLE');
      })
    ).get('/api/automations');

    expect(res.status).toBe(503);
    expect(apiLog.error).toHaveBeenCalledWith(
      'Upstream unavailable',
      expect.objectContaining({ type: 'SERVICE_UNAVAILABLE' })
    );
  });

  it('logs an application error with a client-side status as a warning', async () => {
    await request(app).post('/api/automations/9999/run');

    expect(apiLog.warn).toHaveBeenCalledWith(
      'Automation 9999 not found',
      expect.objectContaining({ type: 'NOT_FOUND' })
    );
    expect(apiLog.error).not.toHaveBeenCalled();
  });

  it('answers a handler result that breaks the contract output as a logged 500 INTERNAL_ERROR', async () => {
    const res = await request(withListHandler(() => [{ unexpected: true }])).get(
      '/api/automations'
    );

    expect(res.status).toBe(500);
    expect(res.body.error.type).toBe('INTERNAL_ERROR');
    expect(apiLog.error).toHaveBeenCalled();
  });

  it('reports input that fails the contract as a whole in the message, not under a field', async () => {
    const res = await request(app).post('/api/automations').send([]);

    expect(res.status).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.errors).toEqual({});
    expect(res.body.error.message).toMatch(/^Invalid input: .+/);
  });
});
