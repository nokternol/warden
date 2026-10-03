import {
  MetadataProviderType,
  mediaEnrichment,
  mediaIdentity,
  mediaItems,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { resetMediaData } from '@server/modules/media/mediaReset';
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

describe('resetMediaData', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });
  afterEach(async () => {
    await _resetDatabase();
  });

  it('deletes every media_identity row and cascades to media_item/media_enrichment', async () => {
    const db = getDb();
    const [{ id: radarrId }] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning({ id: metadataProviders.id });
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    await db
      .insert(mediaItems)
      .values({ providerId: radarrId, externalId: 1, mediaIdentityId: identity.id });
    await new EnrichmentQueries({ db }).replaceFields(identity.id, { playCount: 3 });

    const result = await resetMediaData(db);

    expect(result.deletedIdentities).toBe(1);
    expect(await db.select().from(mediaIdentity)).toHaveLength(0);
    expect(await db.select().from(mediaItems)).toHaveLength(0);
    expect(await db.select().from(mediaEnrichment)).toHaveLength(0);
  });

  it('leaves provider configuration untouched', async () => {
    const db = getDb();
    await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' });
    await db.insert(mediaIdentity).values({ kind: 'movie' });

    await resetMediaData(db);

    expect(await db.select().from(metadataProviders)).toHaveLength(1);
  });

  it('is a no-op on an empty table', async () => {
    const db = getDb();
    const result = await resetMediaData(db);
    expect(result.deletedIdentities).toBe(0);
  });
});
