import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Provider CRUD API integration tests.
 *
 * All provider CRUD routes under /api/providers require authentication.
 * Tests cover: 401 on unauthenticated access, full CRUD, and Zod validation.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Provider CRUD API Integration', () => {
  let authedApp: Express;
  let unauthedApp: Express;
  let authedClient: ReturnType<typeof createApiClient>;
  let unauthedClient: ReturnType<typeof createApiClient>;

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
    const providerRoutes = serveApi({
      providers: createProvidersProcedures(container.cradle, () => {}),
    });

    // Authenticated app: inject fake user before routes
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
    authedApp.use(providerRoutes);
    authedApp.use(errorHandlerMiddleware);

    // Unauthenticated app: no user injected
    unauthedApp = express();
    unauthedApp.use(express.json());
    unauthedApp.use(requestIdMiddleware);
    unauthedApp.use(providerRoutes);
    unauthedApp.use(errorHandlerMiddleware);

    authedClient = createApiClient(authedApp);
    unauthedClient = createApiClient(unauthedApp);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  describe('unauthenticated access', () => {
    it('GET /providers returns 401', async () => {
      const res = await unauthedClient.get('/api/providers');
      expectErrorResponse(res, 401);
    });

    it('POST /providers returns 401', async () => {
      const res = await unauthedClient.post('/api/providers', {
        type: 'RADARR',
        name: 'Radarr',
        url: 'http://localhost:7878',
      });
      expectErrorResponse(res, 401);
    });

    it('PATCH /providers/:id returns 401', async () => {
      const res = await unauthedClient.patch('/api/providers/1', { name: 'X' });
      expectErrorResponse(res, 401);
    });

    it('DELETE /providers/:id returns 401', async () => {
      const res = await unauthedClient.delete('/api/providers/1');
      expectErrorResponse(res, 401);
    });
  });

  // -------------------------------------------------------------------------
  // CRUD — authenticated
  // -------------------------------------------------------------------------

  describe('GET /providers', () => {
    it('returns an empty array when no providers are saved', async () => {
      const res = await authedClient.get('/api/providers');
      const data = expectSuccessResponse(res);
      expect(data).toEqual([]);
    });
  });

  describe('POST /providers', () => {
    it('creates a provider and returns it with apiKey redacted', async () => {
      const res = await authedClient.post('/api/providers', {
        type: MetadataProviderType.SONARR,
        name: 'Sonarr Main',
        url: 'http://localhost:8989/api/v3',
        apiKey: 'my-secret-key',
      });

      const data = expectSuccessResponse(res);
      expect(data.type).toBe(MetadataProviderType.SONARR);
      expect(data.name).toBe('Sonarr Main');
      expect(data.apiKey).toBe('***');
      expect(data.id).toBeGreaterThan(0);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await authedClient.post('/api/providers', { name: 'No type' });
      expectErrorResponse(res, 400);
    });
  });

  describe('PATCH /providers/:id', () => {
    it('updates name and url of an existing provider', async () => {
      const created = await authedClient.post('/api/providers', {
        type: MetadataProviderType.RADARR,
        name: 'Old Name',
        url: 'http://localhost:7878/api/v3',
      });
      const createdData = expectSuccessResponse(created);

      const res = await authedClient.patch(`/api/providers/${createdData.id}`, {
        name: 'New Name',
        url: 'http://radarr:7878/api/v3',
      });
      const data = expectSuccessResponse(res);
      expect(data.name).toBe('New Name');
      expect(data.url).toBe('http://radarr:7878/api/v3');
    });

    it('returns 400 for an invalid id format', async () => {
      const res = await authedClient.patch('/api/providers/not-a-number', {
        name: 'X',
      });
      expectErrorResponse(res, 400);
    });
  });

  describe('DELETE /providers/:id', () => {
    it('removes a provider and it no longer appears in GET list', async () => {
      const created = await authedClient.post('/api/providers', {
        type: MetadataProviderType.PLEX,
        name: 'Plex',
        url: 'http://localhost:32400',
      });
      const createdData = expectSuccessResponse(created);

      const deleteRes = await authedClient.delete(`/api/providers/${createdData.id}`);
      expectSuccessResponse(deleteRes);

      const listRes = await authedClient.get('/api/providers');
      const list = expectSuccessResponse(listRes);
      expect(list.find((r: { id: number }) => r.id === createdData.id)).toBeUndefined();
    });
  });
});
