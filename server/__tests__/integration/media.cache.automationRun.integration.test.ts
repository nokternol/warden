import { buildContainer } from '@server/container';
import { MetadataProviderType } from '@server/database/schema';
/**
 * Integration test: an automation run plans on the library copy as the last catalog refresh stored
 * it, reading no library from the provider, and a Radarr run counts only its own instance's copies.
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
import { browsePath, createApiClient, expectSuccessResponse } from '@tests/helpers/api';
import { refreshCatalog } from '@tests/helpers/library';
import express, { type NextFunction, type Request, type Response } from 'express';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';

describe('media caches after an automation run', () => {
  let cradle: ReturnType<typeof buildContainer>['cradle'];

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    const db = await initializeDatabase(config);
    cradle = buildContainer({ config, db }).cradle;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('a run acts on the copy as last refreshed, reading no library from Radarr', async () => {
    const RADARR_4K = 'http://localhost:7879/api/v3';
    const movie = (id: number, title: string) => ({
      id,
      title,
      hasFile: true,
      monitored: true,
      tmdbId: 1000 + id,
      qualityProfileId: 1,
      tags: [],
      path: `/movies/${title}`,
    });
    let library = [movie(1, 'Alien')];
    let libraryReads = 0;
    const deleted: number[] = [];
    server.use(
      http.get(`${RADARR_4K}/movie`, () => {
        libraryReads++;
        return HttpResponse.json(library);
      }),
      http.delete(`${RADARR_4K}/movie/:id`, ({ params }) => {
        deleted.push(Number(params.id));
        return new HttpResponse(null, { status: 200 });
      })
    );
    const provider = await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4k',
      url: RADARR_4K,
      apiKey: 'fake-key',
      settings: { enabledTasks: ['deleteMovieKeepFiles'] },
    });
    const query = await cradle.mediaQueryService.create({
      name: 'Everything in 4k',
      contentType: 'movie',
      filters: [],
    });
    const automation = await cradle.automationService.create({
      name: 'Remove everything in 4k',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: provider.id,
      taskId: 'deleteMovieKeepFiles',
      schedule: '0 * * * *',
    });
    await refreshCatalog(cradle);

    library = [movie(1, 'Alien'), movie(2, 'Arrival')];
    libraryReads = 0;
    await cradle.automationExecutor.execute(automation.id);

    expect({ deleted, libraryReads }).toEqual({ deleted: [1], libraryReads: 0 });
    await cradle.providerSettingsService.delete(provider.id);
  }, 15_000);

  it("a Radarr automation's targets and reach count cover only its own instance", async () => {
    const OWN = 'http://localhost:7881/api/v3';
    const SIBLING = 'http://localhost:7882/api/v3';
    const movies = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: from + i,
        title: `Movie ${from + i}`,
        hasFile: true,
        monitored: true,
        tmdbId: from + i,
        qualityProfileId: 1,
        tags: [],
        path: `/movies/${from + i}`,
      }));
    server.use(
      http.get(`${OWN}/movie`, () => HttpResponse.json(movies(1, 25))),
      // The sibling holds the same titles and more: none of them is this automation's to touch.
      http.get(`${SIBLING}/movie`, () => HttpResponse.json(movies(1, 100)))
    );
    await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr sibling',
      url: SIBLING,
      apiKey: 'fake-key',
    });
    const own = await cradle.providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr own',
      url: OWN,
      apiKey: 'fake-key',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    const query = await cradle.mediaQueryService.create({
      name: 'On disk',
      contentType: 'movie',
      filters: [{ ruleKey: 'hasFile', value: true }],
    });
    const automation = await cradle.automationService.create({
      name: 'Delete everything on disk',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: own.id,
      taskId: 'deleteMovieWithFiles',
      schedule: '0 * * * *',
    });

    await refreshCatalog(cradle);
    const readiness = await cradle.automationExecutor.readiness(automation.id);

    expect(readiness.count).toBe(25);
    expect(readiness.problems).toContainEqual(expect.stringContaining('act on 25 of 25 copies'));
  }, 15_000);
});
