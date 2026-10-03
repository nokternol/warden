import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAppSettingsProcedures } from '@server/modules/appSettings';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectErrorResponse } from '@tests/helpers/api';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('App Settings API Integration', () => {
  let authedApp: Express;
  let authedClient: ReturnType<typeof createApiClient>;

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
    const appSettingsRoutes = serveApi({
      appSettings: createAppSettingsProcedures(container.cradle),
    });

    authedApp = express();
    authedApp.use(express.json());
    authedApp.use(requestIdMiddleware);
    authedApp.use((_req: Request, _res: Response, next: NextFunction) => {
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
    authedApp.use('/api/app-settings', appSettingsRoutes);
    authedApp.use(errorHandlerMiddleware);

    authedClient = createApiClient(authedApp);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('rejects an unrecognized primaryMediaServer value', async () => {
    const res = await authedClient.patch('/api/app-settings', {
      primaryMediaServer: 'PLEX9000',
    });
    expectErrorResponse(res, 400);
  });

  it('rejects a region that is not a 2-letter code', async () => {
    const res = await authedClient.patch('/api/app-settings', { region: 'USA' });
    expectErrorResponse(res, 400);
  });
});
