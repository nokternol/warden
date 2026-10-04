import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { errorHandlerMiddleware } from '@server/kernel/middleware/errorHandler';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { type Filter, createMediaProcedures } from '@server/modules/media';
import { createMediaQueryProcedures } from '@server/modules/mediaQueries';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { createMockConfig, createRadarrMovie, createSonarrSeries } from '@tests/factories';
import {
  browsePath,
  createApiClient,
  expectErrorResponse,
  expectSuccessResponse,
} from '@tests/helpers/api';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const RADARR_URL = 'http://localhost:7878';
const SONARR_URL = 'http://localhost:8989';

const MOVIES = [
  createRadarrMovie({
    id: 1,
    title: 'Batman Begins',
    year: 2005,
    hasFile: true,
    tmdbId: 272,
    tags: [1, 2],
  }),
  createRadarrMovie({
    id: 2,
    title: 'Batman Returns',
    year: 1992,
    hasFile: false,
    tmdbId: 364,
    tags: [1],
  }),
  createRadarrMovie({
    id: 3,
    title: 'The Matrix',
    year: 1999,
    hasFile: true,
    tmdbId: 603,
    tags: [2],
  }),
];

const SERIES = [
  createSonarrSeries({ id: 1, title: 'Breaking Bad', year: 2008, monitored: true, tvdbId: 81189 }),
  createSonarrSeries({
    id: 2,
    title: 'Better Call Saul',
    year: 2015,
    monitored: false,
    tvdbId: 273181,
  }),
  createSonarrSeries({ id: 3, title: 'Succession', year: 2018, monitored: true, tvdbId: 320785 }),
];

/**
 * Browse and saved-query preview evaluate the same `Filter` entries, so for
 * one active instance the browse page and the preview count describe the
 * same set of items.
 */
describe('Browse speaks the save encoding', () => {
  let client: ReturnType<typeof createApiClient>;
  let mediaQueryService: MediaQueryService;
  let radarrId: number;

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
    mediaQueryService = new MediaQueryService({ db });

    ({ id: radarrId } = await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-api-key',
    }));
    await container.cradle.providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: `${SONARR_URL}/api/v3`,
      apiKey: 'test-api-key',
    });

    const app: Express = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, _res, next) => {
      req.user = { id: 1 } as unknown as NonNullable<typeof req.user>;
      next();
    });
    app.use(
      serveApi({
        media: createMediaProcedures(container.cradle).procedures,
        mediaQueries: createMediaQueryProcedures(container.cradle),
      })
    );
    app.use(errorHandlerMiddleware);
    client = createApiClient(app);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () => HttpResponse.json(MOVIES)),
      http.get(`${SONARR_URL}/api/v3/series`, () => HttpResponse.json(SERIES))
    );
  });

  async function browse(contentType: 'movie' | 'series', filters: Filter[]) {
    const res = await client.get(browsePath(contentType, filters, { pageSize: 100 }));
    return expectSuccessResponse(res) as { totalCount: number; items: { title: string }[] };
  }

  async function preview(contentType: 'movie' | 'series', filters: Filter[]) {
    const saved = await mediaQueryService.create({ name: 'Saved', contentType, filters });
    const res = await client.get(`/api/media-queries/${saved.id}/preview`);
    return expectSuccessResponse(res) as { count: number };
  }

  /** Browses with `filters` and previews a query saved with them, for comparing the two. */
  async function browseAndPreview(contentType: 'movie' | 'series', filters: Filter[]) {
    const page = await browse(contentType, filters);
    const { count } = await preview(contentType, filters);
    return { titles: page.items.map((i) => i.title), browsed: page.totalCount, previewed: count };
  }

  it('browses movies to exactly what a query saved with the same entries previews', async () => {
    const filters: Filter[] = [
      { ruleKey: 'title', value: 'batman' },
      { ruleKey: 'hasFile', value: true },
    ];

    const { titles, browsed, previewed } = await browseAndPreview('movie', filters);

    expect(titles).toEqual(['Batman Begins']);
    expect(browsed).toBe(previewed);
  });

  it('browses series to exactly what a query saved with the same entries previews', async () => {
    const filters: Filter[] = [
      { ruleKey: 'monitored', value: true },
      { ruleKey: 'title', value: 'b' },
    ];

    const { titles, browsed, previewed } = await browseAndPreview('series', filters);

    expect(titles).toEqual(['Breaking Bad']);
    expect(browsed).toBe(previewed);
  });

  it('browses an instance-qualified entry to exactly what a query saved with it previews', async () => {
    const filters: Filter[] = [{ ruleKey: 'tagIds', value: { providerId: radarrId, ids: [1] } }];

    const { titles, browsed, previewed } = await browseAndPreview('movie', filters);

    expect(titles).toEqual(['Batman Begins', 'Batman Returns']);
    expect(browsed).toBe(previewed);
  });

  it('browses a range entry to exactly what a query saved with it previews', async () => {
    const filters: Filter[] = [{ ruleKey: 'year', value: { min: 1995, max: 2010 } }];

    const { titles, browsed, previewed } = await browseAndPreview('movie', filters);

    expect(titles).toEqual(['Batman Begins', 'The Matrix']);
    expect(browsed).toBe(previewed);
  });

  it('rejects filters that are not save-shaped entries instead of browsing unfiltered', async () => {
    const notJson = await client.get('/api/media/movie?filters=hasFile%3Dtrue');
    const legacyShape = await client.get(
      `/api/media/movie?filters=${encodeURIComponent(JSON.stringify({ hasFile: true }))}`
    );

    expectErrorResponse(notJson, 400);
    expectErrorResponse(legacyShape, 400);
  });
});
