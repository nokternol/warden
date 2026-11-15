/**
 * The library copy: the catalog refresh is the only reader of the providers' library data, and
 * every view answers from the copy it stored.
 */
import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { mediaItems } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createMediaProcedures } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { readRefreshRecords } from '@server/modules/providers';
import { createMockConfig, createRadarrMovie } from '@tests/factories';
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { refreshCatalog, seedFacts } from '@tests/helpers/library';
import { server } from '@tests/mocks/server';
import express from 'express';
import { http, HttpResponse, passthrough } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';
const RADARR_B_URL = 'http://localhost:7879';

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
  return { cradle: container.cradle, db, client: createApiClient(app), radarrId: radarr.id };
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

  it('records a failed Radarr instance, keeps its copies and refreshes the others', async () => {
    const radarrB = await ctx.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr B',
      url: `${RADARR_B_URL}/api/v3`,
      apiKey: 'k',
    });
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, title: 'Heat', tmdbId: 949 })])
      ),
      http.get(`${RADARR_B_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 7, title: 'Ronin', tmdbId: 8195 })])
      )
    );
    await refreshCatalog(ctx.cradle);
    server.use(
      http.get(`${RADARR_B_URL}/api/v3/movie`, () => new HttpResponse(null, { status: 500 }))
    );

    await expect(ctx.cradle.systemTaskRunner.run('system:identity-resolution')).rejects.toThrow(
      /Radarr B/
    );
    ctx.cradle.eventBus.emit('media:changed', {});

    const records = await readRefreshRecords(ctx.db);
    const catalogOf = (providerId: number) =>
      records.find((r) => r.providerId === providerId && r.kind === 'catalog');
    expect(catalogOf(ctx.radarrId)).toMatchObject({ failedAt: null, error: null });
    expect(catalogOf(ctx.radarrId)?.refreshedAt).toEqual(expect.any(Number));
    expect(catalogOf(radarrB.id)?.failedAt).toEqual(expect.any(Number));
    expect(catalogOf(radarrB.id)?.error).toMatch(/500/);
    const page = expectSuccessResponse(await ctx.client.get(browsePath('movie', []))) as {
      items: { title: string }[];
      records: Array<{ provider: string; kind: string; error: string | null }>;
    };
    expect(page.items.map((i) => i.title).sort()).toEqual(['Heat', 'Ronin']);
    expect(page.records).toContainEqual(
      expect.objectContaining({
        provider: 'Radarr B',
        kind: 'catalog',
        error: expect.stringMatching(/500/),
      })
    );
  });

  it('says a provider the catalog refresh has never read is not refreshed yet', async () => {
    const page = expectSuccessResponse(await ctx.client.get(browsePath('movie', []))) as {
      records: unknown[];
    };

    expect(page.records).toContainEqual({
      providerId: ctx.radarrId,
      provider: 'Radarr',
      kind: 'catalog',
      refreshedAt: null,
      failedAt: null,
      error: null,
    });
  });

  it('answers filter choices from the stored lists and facts, without reading any provider', async () => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([
          createRadarrMovie({ id: 1, title: 'Heat', tmdbId: 949, genres: ['Crime'] }),
        ])
      ),
      http.get(`${RADARR_URL}/api/v3/tag`, () => HttpResponse.json([{ id: 3, label: 'keep' }])),
      http.get(`${RADARR_URL}/api/v3/qualityprofile`, () =>
        HttpResponse.json([{ id: 4, name: 'HD' }])
      )
    );
    await refreshCatalog(ctx.cradle);
    const [copy] = await ctx.db.select().from(mediaItems);
    await seedFacts(ctx.db, copy.mediaIdentityId, {
      studio: 'Warner Bros.',
      videoCodec: 'hevc',
      labels: ['4K', 'Favourite'],
    });
    ctx.cradle.eventBus.emit('media:changed', {});
    let providerReads = 0;
    server.use(
      http.all('*', ({ request }) => {
        if (new URL(request.url).hostname !== 'localhost') return passthrough();
        providerReads++;
        return HttpResponse.json([]);
      })
    );

    const choices = async (path: string) =>
      expectSuccessResponse(await ctx.client.get(`/api/media/${path}`));

    expect(await choices('tags')).toEqual({
      radarr: [{ id: 3, label: 'keep', providerId: ctx.radarrId, providerName: 'Radarr' }],
      sonarr: [],
    });
    expect(await choices('quality-profiles')).toEqual({
      radarr: [{ id: 4, name: 'HD', providerId: ctx.radarrId, providerName: 'Radarr' }],
      sonarr: [],
    });
    expect(await choices('studio')).toEqual(['Warner Bros.']);
    expect(await choices('video-codecs')).toEqual(['hevc']);
    expect(await choices('labels')).toEqual(['4K', 'Favourite']);
    expect(await choices('genres')).toEqual({ movies: ['Crime'], series: [] });
    expect(providerReads).toBe(0);
  });
});
