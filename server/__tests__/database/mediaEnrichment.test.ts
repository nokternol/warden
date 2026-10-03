import { enrichmentField, mediaEnrichment, mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { fieldsByProviderType } from '@server/modules/media/activeFieldSet';
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
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('survives a round-trip linked to a media_identity row via a field key', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 500 })
      .returning();
    const [field] = await db
      .select()
      .from(enrichmentField)
      .where(eq(enrichmentField.key, 'playCount'));

    const [enr] = await db
      .insert(mediaEnrichment)
      .values({ mediaIdentityId: identity.id, fieldId: field.id, value: '7' })
      .returning();

    expect(enr.mediaIdentityId).toBe(identity.id);
    expect(enr.fieldId).toBe(field.id);
    expect(JSON.parse(enr.value)).toBe(7);
  });

  it('enforces UNIQUE on (mediaIdentityId, fieldId) — one row per field per identity', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const [field] = await db
      .select()
      .from(enrichmentField)
      .where(eq(enrichmentField.key, 'playCount'));

    await db
      .insert(mediaEnrichment)
      .values({ mediaIdentityId: identity.id, fieldId: field.id, value: '1' });
    await expect(
      db
        .insert(mediaEnrichment)
        .values({ mediaIdentityId: identity.id, fieldId: field.id, value: '2' })
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

  // Compares against fieldsByProviderType's deduped values, not a hand-typed list —
  // that object is already compiler-exhaustive against EnrichmentFields
  // (activeFieldSet.ts's _everyFieldHasAProducer), so this transitively proves the
  // migration's seed didn't drift from the field set without needing a second
  // hand-maintained list to keep in sync.
  it('is seeded with exactly the keys fieldsByProviderType declares producers for', async () => {
    const db = getDb();
    const rows = await db.select().from(enrichmentField);
    // 'tags' is excluded: it's MediaFieldSource's construction-only field (built
    // straight onto an item from a single provider's native payload, e.g.
    // normalizeMedia.ts), never written to media_enrichment — same exclusion
    // enricher.ts's EnrichableField makes for the same reason.
    const expectedKeys = new Set(
      Object.values(fieldsByProviderType)
        .flat()
        .filter((key) => key !== 'tags')
    );

    expect(new Set(rows.map((r) => r.key))).toEqual(expectedKeys);
  });
});
