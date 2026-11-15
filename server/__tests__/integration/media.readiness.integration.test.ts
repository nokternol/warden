/**
 * The Media page's browse carries filter readiness findings beside its results, apart from the
 * provider failures in `errors`.
 *
 * Run: vitest run --project server
 */
import { buildContainer } from '@server/container';
import {
  MetadataProviderType,
  automationRuns,
  automations,
  mediaEnrichment,
  mediaIdentity,
} from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { recordRefreshFailed, recordRefreshed } from '@server/modules/providers';
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { seedFacts } from '@tests/helpers/library';
import { server } from '@tests/mocks/server';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
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

describe('Media browse — filter readiness', () => {
  let client: ReturnType<typeof createApiClient>;
  let tautulliId: number;
  let cradle: ReturnType<typeof buildContainer>['cradle'];

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
    cradle = container.cradle;
    for (const type of [MetadataProviderType.RADARR, MetadataProviderType.TAUTULLI]) {
      const created = await container.cradle.providerSettingsService.create({
        type,
        name: type === MetadataProviderType.TAUTULLI ? 'Tautulli' : 'Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'fake-key',
      });
      if (type === MetadataProviderType.TAUTULLI) tautulliId = created.id;
    }

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

  beforeEach(async () => {
    server.use(
      http.get('http://localhost:7878/api/v3/movie', () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'One', tmdbId: 1 })])
      )
    );
    const db = getDb();
    await db.delete(mediaEnrichment);
    await db.delete(mediaIdentity);
  });

  it("believes Tautulli's successful refresh: a watched filter no title holds a value for raises nothing", async () => {
    await recordRefreshed(getDb(), tautulliId, 'facts');
    cradle.eventBus.emit('media:changed', {});

    const data = expectSuccessResponse(
      await client.get(browsePath('movie', [{ ruleKey: 'watched', value: true }]))
    );

    expect(data.findings).toEqual([]);
    expect(data.mediaPage).toBe('clear');
  });

  it("with Tautulli's facts failed, raises an informational finding and names Tautulli in the records", async () => {
    await recordRefreshFailed(getDb(), tautulliId, 'facts', 'Tautulli timed out');
    cradle.eventBus.emit('media:changed', {});

    const data = expectSuccessResponse(
      await client.get(browsePath('movie', [{ ruleKey: 'watched', value: true }]))
    );

    expect(data.findings).toMatchObject([
      { kind: 'data-incomplete', ruleKey: 'watched', providerIds: [tautulliId] },
    ]);
    expect(data.mediaPage).toBe('clear');
    expect(data.records).toContainEqual(
      expect.objectContaining({ provider: 'Tautulli', kind: 'facts', error: 'Tautulli timed out' })
    );
  });
});
