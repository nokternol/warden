import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Source ownership projection — GET /api/media/sources.
 *
 * The client must derive "which provider owns this content type, and is it
 * configured" from this projection, never from its own literal RADARR/SONARR
 * checks. The single authority is `SOURCE_OWNER` in providers/roles.ts.
 *
 * Run: vitest run --project server
 */
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig } from '@tests/factories';
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import express, { type Express } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe('GET /api/media/sources — ownership projection', () => {
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
    // Two active Radarr instances; no Sonarr instance exists.
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'fake-key',
    });
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4k',
      url: 'http://localhost:7879/api/v3',
      apiKey: 'fake-key-2',
    });

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = mockUser;
      next();
    });
    app.use('/api/media', serveApi({ media: createMediaProcedures(container.cradle).procedures }));
    app.use(errorHandlerMiddleware);
    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('projects each content type with its owner type, configured state, and every active instance', async () => {
    const res = await client.get('/api/media/sources');
    const data = expectSuccessResponse(res);

    const movie = data.find((d: { contentType: string }) => d.contentType === 'movie');
    expect(movie.ownerType).toBe('RADARR');
    expect(movie.configured).toBe(true);
    expect(movie.instances.map((i: { name: string }) => i.name).sort()).toEqual([
      'Radarr',
      'Radarr 4k',
    ]);

    const show = data.find((d: { contentType: string }) => d.contentType === 'series');
    expect(show.ownerType).toBe('SONARR');
    expect(show.configured).toBe(false);
    expect(show.instances).toEqual([]);
  });
});
