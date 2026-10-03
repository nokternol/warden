import {
  MetadataProviderType,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { resolveActuatorTargets } from '@server/modules/media';
import type { NormalizedMovie } from '@server/modules/media';
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

const movieItem = (providerId: number, radarrId: number): NormalizedMovie => ({
  _sourceIds: { radarr: radarrId, providerId, tmdb: radarrId * 100 },
  title: `Movie ${radarrId}`,
});

describe('resolveActuatorTargets', () => {
  let radarrId: number;
  let radarr4kId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    [{ id: radarrId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning({ id: metadataProviders.id });
    [{ id: radarr4kId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr 4k', url: 'http://radarr4k' })
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  async function seedIdentity(opts: {
    plexRatingKey?: string;
    jellyfinItemId?: string;
    copies: Array<{ providerId: number; externalId: number; deleted?: boolean }>;
  }): Promise<void> {
    const db = getDb();
    const [{ id: identityId }] = await db
      .insert(mediaIdentity)
      .values({
        kind: 'movie',
        tmdbId: opts.copies[0].externalId * 100,
        plexRatingKey: opts.plexRatingKey,
        jellyfinItemId: opts.jellyfinItemId,
      })
      .returning({ id: mediaIdentity.id });
    for (const copy of opts.copies) {
      await db.insert(mediaItems).values({ ...copy, mediaIdentityId: identityId });
    }
  }

  it('resolves Plex-addressed ids: media_item → media_identity → plexRatingKey', async () => {
    await seedIdentity({
      plexRatingKey: 'rk-1',
      copies: [{ providerId: radarrId, externalId: 1 }],
    });
    await seedIdentity({
      plexRatingKey: 'rk-2',
      copies: [{ providerId: radarrId, externalId: 2 }],
    });

    const { actuatorIds: ids } = await resolveActuatorTargets(getDb(), MetadataProviderType.PLEX, [
      movieItem(radarrId, 1),
      movieItem(radarrId, 2),
    ]);

    expect(ids.sort()).toEqual(['rk-1', 'rk-2']);
  });

  it('resolves Tautulli through the same Plex addressing space', async () => {
    await seedIdentity({
      plexRatingKey: 'rk-9',
      copies: [{ providerId: radarrId, externalId: 9 }],
    });

    const { actuatorIds: ids } = await resolveActuatorTargets(
      getDb(),
      MetadataProviderType.TAUTULLI,
      [movieItem(radarrId, 9)]
    );

    expect(ids).toEqual(['rk-9']);
  });

  it('resolves Jellyfin-addressed ids via jellyfinItemId', async () => {
    await seedIdentity({
      jellyfinItemId: 'jf-abc',
      copies: [{ providerId: radarrId, externalId: 3 }],
    });

    const { actuatorIds: ids } = await resolveActuatorTargets(
      getDb(),
      MetadataProviderType.JELLYFIN,
      [movieItem(radarrId, 3)]
    );

    expect(ids).toEqual(['jf-abc']);
  });

  it('dedupes two instance copies of the same identity and drops unmapped identities', async () => {
    await seedIdentity({
      plexRatingKey: 'rk-5',
      copies: [
        { providerId: radarrId, externalId: 5 },
        { providerId: radarr4kId, externalId: 5 },
      ],
    });
    await seedIdentity({ copies: [{ providerId: radarrId, externalId: 6 }] });

    const { actuatorIds: ids } = await resolveActuatorTargets(getDb(), MetadataProviderType.PLEX, [
      movieItem(radarrId, 5),
      movieItem(radarr4kId, 5),
      movieItem(radarrId, 6),
    ]);

    expect(ids).toEqual(['rk-5']);
  });

  it('only resolves the items asked for, not everything mapped', async () => {
    await seedIdentity({
      plexRatingKey: 'rk-1',
      copies: [{ providerId: radarrId, externalId: 1 }],
    });
    await seedIdentity({
      plexRatingKey: 'rk-2',
      copies: [{ providerId: radarrId, externalId: 2 }],
    });

    const { actuatorIds: ids } = await resolveActuatorTargets(getDb(), MetadataProviderType.PLEX, [
      movieItem(radarrId, 2),
    ]);

    expect(ids).toEqual(['rk-2']);
  });

  it('does not address a copy that left its source', async () => {
    await seedIdentity({
      plexRatingKey: 'rk-4',
      copies: [{ providerId: radarrId, externalId: 4, deleted: true }],
    });

    const { actuatorIds, addressed } = await resolveActuatorTargets(
      getDb(),
      MetadataProviderType.PLEX,
      [movieItem(radarrId, 4)]
    );

    expect(actuatorIds).toEqual([]);
    expect(addressed).toEqual([]);
  });

  it('returns empty for no items without querying', async () => {
    const { actuatorIds: ids } = await resolveActuatorTargets(
      getDb(),
      MetadataProviderType.PLEX,
      []
    );
    expect(ids).toEqual([]);
  });

  it('throws for a provider type with no actuator addressing space', async () => {
    await expect(
      resolveActuatorTargets(getDb(), MetadataProviderType.RADARR, [movieItem(radarrId, 1)])
    ).rejects.toThrow(/addressing space/i);
  });
});
