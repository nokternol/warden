import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { IdentityJobFactory } from '@server/modules/providers/identityJobFactory';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { ProviderSettingsService } from '@server/modules/providers/providerSettingsService';
import type { IdentityJobLike } from '@server/modules/system/systemTaskRunner';
import { createRadarrMovie, createSonarrSeries } from '@tests/factories';
import { server } from '@tests/mocks/server';
import { eq } from 'drizzle-orm';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

const RADARR_URL = 'http://localhost:7878';
const SONARR_URL = 'http://localhost:8989';
const PLEX_URL = 'http://localhost:32400';

async function runIdentityJob(job: IdentityJobLike): Promise<void> {
  await job.runForMovies();
  await job.runForSeries();
  await job.runForPlex();
  await job.runForJellyfin();
}

function makeFactory(): IdentityJobFactory {
  const db = getDb();
  return new IdentityJobFactory({
    db,
    providerSettingsService: new ProviderSettingsService({ db }),
    providerFactory: new ProviderFactory(),
  });
}

describe('IdentityJobFactory', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
    server.resetHandlers();
  });

  it('resolves the active Radarr provider and populates identities; absent Plex does not throw', async () => {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Test Radarr',
      url: `${RADARR_URL}/api/v3`,
      apiKey: 'test-api-key',
    });
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, tmdbId: 603 })])
      )
    );

    const job = await makeFactory().create();
    await expect(runIdentityJob(job)).resolves.toBeUndefined();

    const rows = await db.select().from(mediaIdentity).where(eq(mediaIdentity.kind, 'movie'));
    expect(rows).toHaveLength(1);
    expect(rows[0].tmdbId).toBe(603);
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe(1);
  });

  it('resolves every active Radarr instance, never collapsing to one', async () => {
    const db = getDb();
    // Two active Radarr rows inserted directly — the service-level single-active gate
    // (relaxed only in a later phase) is out of scope here; this proves the factory's
    // own wiring loops every active instance once the gate allows a second one through.
    const radarr4kUrl = 'http://localhost:7879';
    const [radarrA] = await db
      .insert(metadataProviders)
      .values({
        type: MetadataProviderType.RADARR,
        name: 'Radarr',
        url: `${RADARR_URL}/api/v3`,
        apiKey: 'test-api-key',
      })
      .returning();
    const [radarrB] = await db
      .insert(metadataProviders)
      .values({
        type: MetadataProviderType.RADARR,
        name: 'Radarr 4k',
        url: `${radarr4kUrl}/api/v3`,
        apiKey: 'test-api-key',
      })
      .returning();
    server.use(
      http.get(`${RADARR_URL}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 1, tmdbId: 603 })])
      ),
      http.get(`${radarr4kUrl}/api/v3/movie`, () =>
        HttpResponse.json([createRadarrMovie({ id: 55, tmdbId: 603 })])
      )
    );

    const job = await makeFactory().create();
    await job.runForMovies();

    const identities = await db.select().from(mediaIdentity).where(eq(mediaIdentity.kind, 'movie'));
    expect(identities).toHaveLength(1); // same tmdbId → one shared group
    const items = await db.select().from(mediaItems);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.providerId).sort()).toEqual(
      [radarrA.id, radarrB.id].sort((a, b) => a - b)
    );
  });

  it('resolves the active Plex provider and writes plexRatingKey for matching identities', async () => {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    await providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Test Plex',
      url: PLEX_URL,
      apiKey: 'plex-token',
    });
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 603, resolvedAt: 0 });
    server.use(
      http.get(`${PLEX_URL}/library/sections`, () =>
        HttpResponse.json({ MediaContainer: { Directory: [{ key: '1' }] } })
      ),
      http.get(`${PLEX_URL}/library/sections/1/all`, () =>
        HttpResponse.json({
          MediaContainer: { Metadata: [{ ratingKey: 'rk-1', guids: [{ id: 'tmdb://603' }] }] },
        })
      )
    );

    const job = await makeFactory().create();
    await runIdentityJob(job);

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.tmdbId, 603));
    expect(row.plexRatingKey).toBe('rk-1');
  });

  it('resolves the active Jellyfin provider and writes jellyfinItemId for matching identities', async () => {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    const jellyfinUrl = 'http://localhost:8096';
    await providerSettingsService.create({
      type: MetadataProviderType.JELLYFIN,
      name: 'Test Jellyfin',
      url: jellyfinUrl,
      apiKey: 'jf-token',
      settings: { userId: 'test-user-id' },
    });
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 603, resolvedAt: 0 });
    server.use(
      http.get(`${jellyfinUrl}/Users/:userId/Items`, () =>
        HttpResponse.json({
          Items: [{ Id: 'jf-603', Type: 'Movie', ProviderIds: { Tmdb: '603' } }],
          TotalRecordCount: 1,
        })
      )
    );

    const job = await makeFactory().create();
    await runIdentityJob(job);

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.tmdbId, 603));
    expect(row.jellyfinItemId).toBe('jf-603');
  });

  it('backfills tvMazeId for a Sonarr series via the tvMaze lookup', async () => {
    const db = getDb();
    const providerSettingsService = new ProviderSettingsService({ db });
    await providerSettingsService.create({
      type: MetadataProviderType.SONARR,
      name: 'Test Sonarr',
      url: `${SONARR_URL}/api/v3`,
      apiKey: 'test-api-key',
    });
    server.use(
      http.get(`${SONARR_URL}/api/v3/series`, () =>
        HttpResponse.json([createSonarrSeries({ id: 5, tvdbId: 81189 })])
      ),
      http.get('https://api.tvmaze.com/lookup/shows', () => HttpResponse.json({ id: 169 }))
    );

    const job = await makeFactory().create();
    await runIdentityJob(job);

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.kind, 'series'));
    expect(row.tvMazeId).toBe(169);
  });
});
