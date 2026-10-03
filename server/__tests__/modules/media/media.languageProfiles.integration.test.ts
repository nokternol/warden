import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Sonarr provider spec — the language-profile lookup route. Language profiles
 * are Sonarr-only (Radarr has no equivalent concept), so this route returns a
 * flat array rather than the {radarr, sonarr} pair listQualityProfiles uses.
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const mockUser = {
  id: 1,
  email: 'test@example.com',
  plexUsername: 'testuser',
  plexId: null,
  avatar: null,
  userType: 'plex' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Media lookup routes — Sonarr language profiles', () => {
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
    const { providerSettingsService } = container.cradle;

    await providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'fake-key',
    });

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      _req.user = mockUser;
      next();
    });
    app.use('/api/media', serveApi({ media: createMediaProcedures(container.cradle).procedures }));
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    server.use(
      http.get('http://localhost:8989/api/v3/languageprofile', () =>
        HttpResponse.json([
          { id: 1, name: 'English' },
          { id: 2, name: 'English/Japanese' },
        ])
      )
    );
  });

  describe('GET /api/media/language-profiles', () => {
    it('returns a flat array of language profiles decorated with providerId/providerName', async () => {
      const res = await client.get('/api/media/language-profiles');
      const data = expectSuccessResponse(res) as Array<{
        id: number;
        name: string;
        providerId: number;
        providerName: string;
      }>;
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ id: 1, name: 'English', providerName: 'Sonarr' });
    });
  });
});
