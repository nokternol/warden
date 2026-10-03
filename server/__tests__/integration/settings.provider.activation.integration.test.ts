import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Integration test for the single-active-provider-per-type invariant (D8) at the API edge.
 *
 * Confirms the ValidationError thrown by ProviderSettingsService surfaces as a 400
 * VALIDATION_ERROR through the settings provider routes — not an unhandled 500.
 *
 * Run: yarn vitest run --project server server/__tests__/integration/settings.provider.activation.integration.test.ts
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProviderSettingsProcedures } from '@server/modules/settings';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse, expectValidationError } from '@tests/helpers/api';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, it } from 'vitest';

describe('POST /api/settings/providers — single-active-provider-per-type (D8)', () => {
  let app: Express;
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
    const container = buildContainer({ config, db });
    const settingsRoutes = serveApi({
      providers: createProviderSettingsProcedures(container.cradle),
    });

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = {
        id: 1,
        email: 'test@example.com',
        plexUsername: 'testuser',
        plexId: null,
        avatar: null,
        userType: 'plex',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      next();
    });
    app.use(settingsRoutes);
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('returns 400 VALIDATION_ERROR when creating a second active provider of an already-active type', async () => {
    await client.post('/api/settings/providers', {
      type: MetadataProviderType.TMDB,
      name: 'TMDB',
      url: 'http://tmdb1',
    });

    const response = await client.post('/api/settings/providers', {
      type: MetadataProviderType.TMDB,
      name: 'TMDB 2',
      url: 'http://tmdb2',
    });

    expectValidationError(response);
  });

  it('returns 200 when creating a second active Radarr instance — MediaSource role has no single-active invariant', async () => {
    await client.post('/api/settings/providers', {
      type: MetadataProviderType.RADARR,
      name: 'Radarr 1080p',
      url: 'http://radarr1:7878/api/v3',
    });

    const response = await client.post('/api/settings/providers', {
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4K',
      url: 'http://radarr2:7878/api/v3',
    });

    expectSuccessResponse(response);
  });
});
