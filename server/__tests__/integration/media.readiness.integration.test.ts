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
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
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
    for (const type of [MetadataProviderType.RADARR, MetadataProviderType.TAUTULLI]) {
      await container.cradle.providerSettingsService.create({
        type,
        name: type,
        url: 'http://localhost:7878/api/v3',
        apiKey: 'fake-key',
      });
    }
    const [job] = await db
      .insert(automations)
      .values({
        name: 'Enrichment',
        kind: 'system',
        taskId: 'system:enrichment',
        schedule: '0 * * * *',
      })
      .returning();
    await db
      .insert(automationRuns)
      .values({ automationId: job.id, status: 'success', kind: 'system' });

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

  it('returns a no-data finding, not a source error, for a filter whose field holds no value', async () => {
    const res = await client.get(browsePath('movie', [{ ruleKey: 'watched', value: true }]));

    const data = expectSuccessResponse(res);
    expect(data.errors).toEqual([]);
    expect(data.findings).toMatchObject([{ kind: 'no-data', ruleKey: 'watched' }]);
    expect(data.mediaPage).toBe('warns');
  });

  it('returns no finding once a title holds a value', async () => {
    const [identity] = await getDb()
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 1 })
      .returning();
    await new EnrichmentQueries({ db: getDb() }).replaceFields(identity.id, { playCount: 1 });

    const res = await client.get(browsePath('movie', [{ ruleKey: 'watched', value: true }]));

    const data = expectSuccessResponse(res);
    expect(data.findings).toEqual([]);
    expect(data.mediaPage).toBe('clear');
  });
});
