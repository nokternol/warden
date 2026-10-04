import { type Scope, scope } from '@contract/scope';
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createRulesProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Cradle = ReturnType<typeof buildContainer>['cradle'];

function rulesClient(cradle: Cradle, declared: Scope) {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use((req, _res, next) => {
    req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
    next();
  });
  const procedures = createRulesProcedures({
    activeFieldSetCache: cradle.activeFieldSetCache,
    scope: declared,
  });
  app.use(serveApi({ media: procedures }));
  app.use(errorHandlerMiddleware);
  return createApiClient(app);
}

/**
 * The rules served follow the scope declaration: a rule it defers is not
 * served even when a configured, offered provider produces it.
 */
describe('GET /api/rules under the scope declaration', () => {
  let cradle: Cradle;

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    cradle = buildContainer({ config, db }).cradle;
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'k',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  const servedKeys = async (declared: Scope): Promise<string[]> => {
    const res = await rulesClient(cradle, declared).get('/api/rules');
    return (expectSuccessResponse(res) as { key: string }[]).map((r) => r.key);
  };

  it('does not serve a deferred rule that has a live producer, and serves it once un-deferred', async () => {
    const deferringMonitored: Scope = {
      deferred: { ...scope.deferred, rules: [...scope.deferred.rules, 'monitored'] },
    };

    expect(await servedKeys(deferringMonitored)).not.toContain('monitored');
    expect(await servedKeys(scope)).toContain('monitored');
  });
});
