import { buildContainer } from '@server/container';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createProvidersProcedures } from '@server/modules/providers';
import { createMockConfig } from '@tests/factories';
import { createApiClient } from '@tests/helpers/api';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The provider types Warden offers, as the server projects them: the one
 * catalogue the client builds its add-provider list from.
 */
describe('GET /api/providers/types', () => {
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

  it('serves exactly the offered types, each with its label, in display order', async () => {
    const res = await client.get('/api/providers/types');

    expect(res.status).toBe(200);
    expect(
      res.body.data.map(({ type, label }: { type: string; label: string }) => ({ type, label }))
    ).toEqual([
      { type: 'PLEX', label: 'Plex' },
      { type: 'JELLYFIN', label: 'Jellyfin' },
      { type: 'RADARR', label: 'Radarr' },
      { type: 'SONARR', label: 'Sonarr' },
      { type: 'TAUTULLI', label: 'Tautulli' },
      { type: 'OVERSEERR', label: 'Overseerr' },
    ]);
  });
});
