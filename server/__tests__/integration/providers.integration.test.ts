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
import express, { type Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Providers API Integration', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;
  let providerSettingsService: ProviderSettingsService;

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
    providerSettingsService = new ProviderSettingsService({ db });

    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(serveApi({ providers: createProvidersProcedures(container.cradle) }));
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
    it('serves per configured instance its options for the quality-profiles route', async () => {
      const radarr = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'My Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'k',
      });

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

  describe('GET /api/providers/metadata', () => {
    it('returns Sonarr metadata when given valid SONARR params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=SONARR&url=http://localhost:8989/api/v3&apiKey=fake-api-key'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('SONARR');
      expect(data.data).toHaveProperty('series');
      expect(data.data).toHaveProperty('qualityProfiles');
      expect(data.data).toHaveProperty('rootFolders');
      expect(data.data).toHaveProperty('tags');
      expect(data.data.series[0].title).toBe('Breaking Bad');
    });

    it('returns Radarr metadata when given valid RADARR params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=RADARR&url=http://localhost:7878/api/v3&apiKey=fake-api-key'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('RADARR');
      expect(data.data).toHaveProperty('movies');
      expect(data.data).toHaveProperty('qualityProfiles');
      expect(data.data).toHaveProperty('rootFolders');
      expect(data.data).toHaveProperty('tags');
    });

    it('returns Plex metadata when given valid PLEX params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=PLEX&url=http://localhost:32400&apiKey=fake-plex-token'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('PLEX');
      expect(data.data).toHaveProperty('libraries');
      expect(data.data.libraries[0].title).toBe('Movies');
    });

    it('returns Jellyfin metadata when given valid JELLYFIN params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=JELLYFIN&url=http://localhost:8096&apiKey=fake-api-key&settings=%7B%22userId%22%3A%22user-id-123%22%7D'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('JELLYFIN');
      expect(data.data).toHaveProperty('libraries');
    });

    it('returns Tautulli metadata when given valid TAUTULLI params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=TAUTULLI&url=http://localhost:8181&apiKey=fake-api-key'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('TAUTULLI');
      expect(data.data).toHaveProperty('libraryStats');
      expect(data.data).toHaveProperty('homeStats');
      expect(data.data).toHaveProperty('recentHistory');
    });

    it('returns Overseerr metadata when given valid OVERSEERR params', async () => {
      const response = await client.get(
        '/api/providers/metadata?type=OVERSEERR&url=http://localhost:5055&apiKey=fake-api-key'
      );
      const data = expectSuccessResponse(response);

      expect(data.type).toBe('OVERSEERR');
      expect(data.data).toHaveProperty('requests');
    });

    it('returns 400 when type is missing', async () => {
      const response = await client.get(
        '/api/providers/metadata?url=http://localhost:8989&apiKey=key'
      );
      expectErrorResponse(response, 400);
    });

    it('returns 400 when url is missing', async () => {
      const response = await client.get('/api/providers/metadata?type=SONARR&apiKey=key');
      expectErrorResponse(response, 400);
    });
  });
});
