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

/** Every task the offered provider types offer, by type; the request manager offers none. */
const OFFERED_TASKS: Record<string, string[]> = {
  RADARR: [
    'unmonitorMovie',
    'triggerSearch',
    'deleteMovieWithFiles',
    'deleteMovieKeepFiles',
    'refreshMovie',
    'rescanMovie',
    'renameMovies',
    'refreshCollection',
    'changeQualityProfile',
    'addTag',
    'removeTag',
  ],
  SONARR: [
    'unmonitorSeries',
    'triggerSearch',
    'deleteSeriesWithFiles',
    'deleteSeriesKeepFiles',
    'refreshSeries',
    'rescanSeries',
    'renameSeries',
    'changeQualityProfile',
    'addTag',
    'removeTag',
  ],
  PLEX: ['deleteFromLibrary', 'refreshMetadata', 'markPlayed', 'markUnplayed'],
  JELLYFIN: [
    'deleteItem',
    'refreshMetadata',
    'markPlayed',
    'markUnplayed',
    'addToCollection',
    'removeFromCollection',
  ],
  TAUTULLI: ['deleteWatchHistory'],
};

describe('GET /api/providers/tasks for the offered types', () => {
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

    const offered = [
      MetadataProviderType.RADARR,
      MetadataProviderType.SONARR,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.OVERSEERR,
    ];
    for (const type of offered) {
      await container.cradle.providerSettingsService.create({
        type,
        name: type,
        url: 'http://localhost:1234',
        apiKey: 'k',
      });
    }

    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(serveApi({ providers: createProvidersProcedures(container.cradle, () => {}) }));
    app.use(errorHandlerMiddleware);
    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('offers exactly the 32 offered tasks, each under its own type', async () => {
    const data = expectSuccessResponse(await client.get('/api/providers/tasks')) as Array<{
      type: string;
      tasks: Array<{ id: string }>;
    }>;
    const offeredByType = Object.fromEntries(
      data.map((entry) => [entry.type, entry.tasks.map((t) => t.id)])
    );

    expect(offeredByType).toEqual(OFFERED_TASKS);
    expect(Object.values(offeredByType).flat()).toHaveLength(32);
  });
});
