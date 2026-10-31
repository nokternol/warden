import { scope } from '@contract/scope';
import { buildContainer } from '@server/container';
import type { AppConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createApiRouter } from '@server/modules';
import { asValue } from 'awilix';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5095,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

type Method = 'get' | 'patch';

/** Every deferred procedure, called as a caller with valid input would call it. */
const DEFERRED_CALLS: [Method, string][] = [
  ['get', '/api/providers/ratings?title=Inception'],
  ['get', '/api/providers/metadata?type=RADARR&url=http://localhost:7878'],
  ['get', '/api/search/metadata?title=Inception'],
  ['get', '/api/app-settings'],
  ['patch', '/api/app-settings'],
];

/** True when the response is the contract implementer's refusal, not an unmatched route. */
function isRefusedAsDeferred(res: request.Response) {
  return res.status === 404 && res.body?.error?.type === 'NOT_FOUND';
}

type Cradle = ReturnType<typeof buildContainer>['cradle'];

/** An app serving the real API router, with or without a signed-in caller. */
function serve(cradle: Cradle, caller: 'signed-in' | 'signed-out' = 'signed-out'): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  if (caller === 'signed-in') {
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
  }
  app.use('/api', createApiRouter(cradle));
  return app;
}

describe('deferred API procedures', () => {
  let cradle: Cradle;

  beforeAll(async () => {
    const db = await initializeDatabase(testConfig);
    cradle = buildContainer({ config: testConfig, db }).cradle;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it.each(DEFERRED_CALLS)('answers a signed-in %s %s with 404', async (method, url) => {
    const res = await request(serve(cradle, 'signed-in'))[method](url);

    expect(isRefusedAsDeferred(res)).toBe(true);
  });

  it.each(DEFERRED_CALLS)('answers a signed-out %s %s with 404, not 401', async (method, url) => {
    const res = await request(serve(cradle))[method](url);

    expect(isRefusedAsDeferred(res)).toBe(true);
  });

  it.each(DEFERRED_CALLS)('answers %s %s with 404 under the auth bypass', async (method, url) => {
    const { cradle: bypassed } = buildContainer({
      config: { ...testConfig, BYPASS_AUTH: true },
      db: cradle.db,
    });

    const res = await request(serve(bypassed))[method](url);

    expect(isRefusedAsDeferred(res)).toBe(true);
  });

  it('never invokes the handler of a deferred procedure', async () => {
    const handlerWork = vi.spyOn(cradle.appSettingsService, 'get');

    await request(serve(cradle, 'signed-in')).get('/api/app-settings');

    expect(handlerWork).not.toHaveBeenCalled();
  });

  it('reaches the handler once the procedure has no entry in the declaration', async () => {
    const container = buildContainer({ config: testConfig, db: cradle.db });
    container.register({
      scope: asValue({
        deferred: {
          ...scope.deferred,
          procedures: scope.deferred.procedures.filter((path) => path !== '/api/app-settings'),
        },
      }),
    });
    const handlerWork = vi.spyOn(container.cradle.appSettingsService, 'get');

    const res = await request(serve(container.cradle, 'signed-in')).get('/api/app-settings');

    expect(res.status).toBe(200);
    expect(handlerWork).toHaveBeenCalledOnce();
  });
});
