import { mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
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

describe('media_identity table', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('survives a round-trip for a movie group', async () => {
    const db = getDb();
    const [row] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 100, imdbId: 'tt1234567' })
      .returning();

    expect(row.kind).toBe('movie');
    expect(row.tmdbId).toBe(100);
    expect(row.imdbId).toBe('tt1234567');
    expect(row.id).toBeTypeOf('number');
  });

  it('enforces one movie group per tmdbId', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 1 });
    await expect(db.insert(mediaIdentity).values({ kind: 'movie', tmdbId: 1 })).rejects.toThrow();
  });
});
