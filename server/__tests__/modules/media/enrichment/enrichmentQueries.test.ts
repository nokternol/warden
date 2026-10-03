import { enrichmentField, mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
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

describe('EnrichmentQueries', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('round-trips a written field value with its correct type', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    await queries.replaceFields(identity.id, { playCount: 3 });
    const result = await queries.getByIdentityIds([identity.id]);

    expect(result.get(identity.id)).toEqual({ playCount: 3 });
  });

  it('returns only the fields actually written for an identity, no null-padding for absent ones', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    await queries.replaceFields(identity.id, { playCount: 3, tmdbStatus: 'Released' });
    const result = await queries.getByIdentityIds([identity.id]);

    expect(Object.keys(result.get(identity.id)!).sort()).toEqual(['playCount', 'tmdbStatus']);
  });

  it('fully replaces prior fields — a field omitted from a later call is gone, not stale', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    await queries.replaceFields(identity.id, { playCount: 3, tmdbStatus: 'Released' });
    await queries.replaceFields(identity.id, { playCount: 5 });
    const result = await queries.getByIdentityIds([identity.id]);

    expect(result.get(identity.id)).toEqual({ playCount: 5 });
  });

  it('batches across multiple identity ids without cross-contaminating rows', async () => {
    const db = getDb();
    const [identityA] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const [identityB] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    await queries.replaceFields(identityA.id, { playCount: 1 });
    await queries.replaceFields(identityB.id, { playCount: 9, tmdbStatus: 'Released' });
    const result = await queries.getByIdentityIds([identityA.id, identityB.id]);

    expect(result.get(identityA.id)).toEqual({ playCount: 1 });
    expect(result.get(identityB.id)).toEqual({ playCount: 9, tmdbStatus: 'Released' });
  });

  it('returns no entry for an identity with zero enrichment rows', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    const result = await queries.getByIdentityIds([identity.id]);

    expect(result.has(identity.id)).toBe(false);
  });

  it('round-trips a string value containing an embedded quote without double-encoding it', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });

    await queries.replaceFields(identity.id, { tmdbStatus: 'In "Production"' });
    const result = await queries.getByIdentityIds([identity.id]);

    expect(result.get(identity.id)).toEqual({ tmdbStatus: 'In "Production"' });
  });

  it('throws when a field key has no seeded enrichment_field row (migration/EnrichmentFields drift)', async () => {
    const db = getDb();
    const [identity] = await db.insert(mediaIdentity).values({ kind: 'movie' }).returning();
    const queries = new EnrichmentQueries({ db });
    // Simulates seed drift: a key EnrichmentFields declares but the migration never seeded.
    await db.delete(enrichmentField).where(eq(enrichmentField.key, 'tmdbStatus'));

    await expect(queries.replaceFields(identity.id, { tmdbStatus: 'Released' })).rejects.toThrow(
      /tmdbStatus/
    );
  });
});
