import { type Scope, scope } from '@contract/scope';
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The tasks offered for enablement and automation follow the scope
 * declaration. No task is deferred today, so the declaration here defers one
 * to prove the projection consults it.
 */
describe('GET /api/providers/tasks under the scope declaration', () => {
  let client: ReturnType<typeof createApiClient>;

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
    const { cradle } = buildContainer({ config, db });

    const deferringRadarrSearch: Scope = {
      deferred: {
        ...scope.deferred,
        tasks: [{ providerType: 'RADARR', taskId: 'triggerSearch' }],
      },
    };
    const procedureCradle = {
      providerSettingsService: cradle.providerSettingsService,
      providerFactory: cradle.providerFactory,
      config: cradle.config,
      scope: deferringRadarrSearch,
    };

    for (const [type, url] of [
      [MetadataProviderType.RADARR, 'http://localhost:7878/api/v3'],
      [MetadataProviderType.SONARR, 'http://localhost:8989/api/v3'],
    ] as const) {
      await cradle.providerSettingsService.create({ type, name: type, url, apiKey: 'k' });
    }

    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ providers: createProvidersProcedures(procedureCradle, () => {}) }));
    app.use(errorHandlerMiddleware);
    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("does not offer a deferred task, and still offers another type's task of the same id", async () => {
    const data = expectSuccessResponse(await client.get('/api/providers/tasks')) as Array<{
      type: string;
      tasks: Array<{ id: string }>;
    }>;
    const taskIdsOf = (type: string) =>
      data.find((entry) => entry.type === type)?.tasks.map((t) => t.id) ?? [];

    expect(taskIdsOf('RADARR')).not.toContain('triggerSearch');
    expect(taskIdsOf('SONARR')).toContain('triggerSearch');
  });
});
