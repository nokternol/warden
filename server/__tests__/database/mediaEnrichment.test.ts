import {
  MetadataProviderType,
  enrichmentField,
  mediaEnrichment,
  mediaIdentity,
  metadataProviders,
} from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import type { ReportedFactKey } from '@server/modules/providers';

/** Every reported fact key; the type makes the list complete and exact. */
const EVERY_REPORTED_FACT: Record<ReportedFactKey, true> = {
  playCount: true,
  lastWatchedAt: true,
  requestStatus: true,
  hasIssue: true,
  productionStatus: true,
  addedToMediaServerAt: true,
  studio: true,
  runtimeMinutes: true,
  fileSizeBytes: true,
  releaseDate: true,
  fileContainer: true,
  videoCodec: true,
  audioCodec: true,
  fileResolution: true,
  labels: true,
  isFavorite: true,
};
import { eq } from 'drizzle-orm';
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

describe('media_enrichment table', () => {
  let providerId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    [{ id: providerId }] = await getDb()
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' })
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('survives a round-trip linked to a media_identity row via a field key', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'movie', tmdbId: 500 })
      .returning();
    const [field] = await db
      .select()
      .from(enrichmentField)
      .where(eq(enrichmentField.key, 'playCount'));

    const [enr] = await db
      .insert(mediaEnrichment)
      .values({ mediaIdentityId: identity.id, fieldId: field.id, providerId, value: '7' })
      .returning();

    expect(enr.mediaIdentityId).toBe(identity.id);
    expect(enr.fieldId).toBe(field.id);
    expect(JSON.parse(enr.value)).toBe(7);
  });

  it('enforces UNIQUE on (mediaIdentityId, fieldId, providerId) — one row per field per provider', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ contentType: 'movie' }).returning();
    const [field] = await db
      .select()
      .from(enrichmentField)
      .where(eq(enrichmentField.key, 'playCount'));

    await db
      .insert(mediaEnrichment)
      .values({ mediaIdentityId: identity.id, fieldId: field.id, providerId, value: '1' });
    await expect(
      db
        .insert(mediaEnrichment)
        .values({ mediaIdentityId: identity.id, fieldId: field.id, providerId, value: '2' })
    ).rejects.toThrow();
  });
});

describe('enrichment_field table', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('holds exactly one field row per reported fact after every migration', async () => {
    const rows = await getDb().select().from(enrichmentField);

    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(EVERY_REPORTED_FACT).sort());
  });
});
