import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { ProviderSettingsService } from '@server/modules/providers';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectErrorResponse, expectSuccessResponse } from '@tests/helpers/api';
import { refreshCatalog } from '@tests/helpers/library';
import { proceduresOffered } from '@tests/helpers/scope';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Providers API Integration', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;
  let providerSettingsService: ProviderSettingsService;
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  beforeAll(async () => {
    const mockConfig = createMockConfig({
      NODE_ENV: 'test',
      PORT: 5057,
      DB_PATH: ':memory:',
      DB_LOGGING: false,
    });

    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }

    const config = loadConfig();
    const db = await initializeDatabase(config);
    const container = buildContainer({ config, db });
    cradle = container.cradle;
    providerSettingsService = new ProviderSettingsService({ db });

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(
      serveApi(
        { providers: createProvidersProcedures(container.cradle) },
        { scope: proceduresOffered }
      )
    );
    app.use(errorHandlerMiddleware);

    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('GET /api/providers/tasks', () => {
    it('serves per configured actuator instance its descriptors tagged with enablement, omitting non-actuators', async () => {
      const radarr = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'My Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'k',
        settings: { enabledTasks: ['deleteMovieWithFiles'] },
      });
      await providerSettingsService.create({
        type: MetadataProviderType.TMDB,
        name: 'My TMDB',
        url: 'https://api.themoviedb.org/3',
        apiKey: 'k',
      });

      const response = await client.get('/api/providers/tasks');
      const data = expectSuccessResponse(response) as Array<{
        providerId: number;
        type: string;
        tasks: Array<{ id: string; label: string; destructive: boolean; enabled: boolean }>;
      }>;

      // Non-actuator (TMDB) is absent; the Radarr instance is keyed by id.
      expect(data.map((e) => e.type)).not.toContain('TMDB');
      const entry = data.find((e) => e.providerId === radarr.id);
      expect(entry?.type).toBe('RADARR');

      const del = entry?.tasks.find((t) => t.id === 'deleteMovieWithFiles');
      expect(del?.destructive).toBe(true);
      expect(del?.enabled).toBe(true);
      expect(del).not.toHaveProperty('run');

      const unmonitor = entry?.tasks.find((t) => t.id === 'unmonitorMovie');
      expect(unmonitor?.enabled).toBe(false);
    });
  });

  describe('GET /api/providers/task-options/:route', () => {
    it('serves per configured instance its stored quality profiles, without reading Radarr', async () => {
      const radarr = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'My Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'k',
      });
      await refreshCatalog(cradle);
      let radarrReads = 0;
      server.use(
        http.get('http://localhost:7878/api/v3/*', () => {
          radarrReads++;
          return HttpResponse.json([]);
        })
      );

      const response = await client.get('/api/providers/task-options/quality-profiles');
      const data = expectSuccessResponse(response) as Array<{
        providerId: number;
        type: string;
        options: Array<{ id: string; label: string }>;
      }>;

      const entry = data.find((e) => e.providerId === radarr.id);
      expect(entry?.type).toBe('RADARR');
      expect(entry?.options).toEqual(
        expect.arrayContaining([
          { id: '1', label: 'HD-1080p' },
          { id: '2', label: 'Any' },
        ])
      );
      expect(radarrReads).toBe(0);
    });

    it("offers a tag task the instance's stored tags as choices", async () => {
      const radarr = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Tagged Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'k',
        isActive: true,
      });
      await refreshCatalog(cradle);

      const response = await client.get('/api/providers/task-options/tags');
      const data = expectSuccessResponse(response) as Array<{
        providerId: number;
        type: string;
        options: Array<{ id: string; label: string }>;
      }>;

      const entry = data.find((e) => e.providerId === radarr.id);
      expect(entry?.options).toEqual([
        { id: '1', label: 'action' },
        { id: '2', label: 'sci-fi' },
      ]);
    });

    it('returns an empty options list for collections — no provider fetches real collections yet', async () => {
      const jellyfin = await providerSettingsService.create({
        type: MetadataProviderType.JELLYFIN,
        name: 'My Jellyfin',
        url: 'http://localhost:8096',
        apiKey: 'k',
      });

      const response = await client.get('/api/providers/task-options/collections');
      const data = expectSuccessResponse(response) as Array<{
        providerId: number;
        options: unknown[];
      }>;

      const entry = data.find((e) => e.providerId === jellyfin.id);
      expect(entry?.options).toEqual([]);
    });
  });
});
