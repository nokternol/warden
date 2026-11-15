/**
 * The library copy: the catalog refresh is the only reader of the providers' library data, and
 * every view answers from the copy it stored.
 */
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { refreshCatalog } from '@tests/helpers/library';
import { server } from '@tests/mocks/server';
import express from 'express';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';

async function setUp() {
  for (const [key, value] of Object.entries(
    createMockConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', DB_LOGGING: false })
  )) {
    process.env[key] = String(value);
  }
  const config = loadConfig();
  const db = await initializeDatabase(config);
  const container = buildContainer({ config, db });
  const radarr = await container.cradle.providerSettingsService.create({
    type: MetadataProviderType.RADARR,
    name: 'Radarr',
    url: `${RADARR_URL}/api/v3`,
    apiKey: 'k',
  });
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use((req, _res, next) => {
    req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
    next();
  });
  app.use(serveApi({ media: createMediaProcedures(container.cradle).procedures }));
  app.use(errorHandlerMiddleware);
  return { cradle: container.cradle, client: createApiClient(app), radarrId: radarr.id };
}

describe('the library copy', () => {
  let ctx: Awaited<ReturnType<typeof setUp>>;

  beforeEach(async () => {
    ctx = await setUp();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('browses the titles the last catalog refresh stored, without reading Radarr', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'Heat', tmdbId: 949 })])
      )
    );
    await refreshCatalog(ctx.cradle);

    let radarrReads = 0;
    server.use(
      http.get(`${RADARR_URL}/api/v3/*`, () => {
        radarrReads++;
        return HttpResponse.json([]);
      })
    );
    const page = expectSuccessResponse(await ctx.client.get(browsePath('movie', []))) as {
      items: { title: string }[];
    };

    expect(page.items.map((i) => i.title)).toEqual(['Heat']);
    expect(radarrReads).toBe(0);
  });
});
