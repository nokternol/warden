import { buildContainer } from '@server/container';
import type { AppConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createApiRouter } from '@server/modules';
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

describe('deferred API procedures', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];
  let signedIn: Express;

  beforeAll(async () => {
    const db = await initializeDatabase(testConfig);
    cradle = buildContainer({ config: testConfig, db }).cradle;
    signedIn = express();
    signedIn.use(express.json());
    signedIn.use(requestIdMiddleware);
    signedIn.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    signedIn.use('/api', createApiRouter(cradle));
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it.each(DEFERRED_CALLS)('answers a signed-in %s %s with 404', async (method, url) => {
    expect(isRefusedAsDeferred(await request(signedIn)[method](url))).toBe(true);
  });

  it('never invokes the handler of a deferred procedure', async () => {
    const handlerWork = vi.spyOn(cradle.appSettingsService, 'get');

    await request(signedIn).get('/api/app-settings');

    expect(handlerWork).not.toHaveBeenCalled();
  });
});
