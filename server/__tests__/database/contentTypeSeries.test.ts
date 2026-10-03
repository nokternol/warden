import fs from 'node:fs';
import path from 'node:path';
import { mediaIdentity, mediaQueries } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { eq, sql } from 'drizzle-orm';
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

// Replays the migration's SQL against rows shaped like a pre-migration install.
async function replayMigration(db: ReturnType<typeof getDb>) {
  const migrationPath = path.resolve(
    __dirname,
    '../../database/migrations/0026_content_type_series.sql'
  );
  const statements = fs
    .readFileSync(migrationPath, 'utf-8')
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await db.run(sql.raw(statement));
  }
}

describe('migration 0026 — stored show content types become series', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('reads a stored show query back as series and leaves movie queries alone', async () => {
    const db = getDb();
    const [legacy] = await db
      .insert(mediaQueries)
      .values({ name: 'was show', contentType: 'series' })
      .returning();
    // `show` is outside ContentType, so the legacy row is written in raw SQL.
    await db.run(sql`UPDATE media_queries SET contentType = 'show' WHERE id = ${legacy.id}`);
    const [movies] = await db
      .insert(mediaQueries)
      .values({ name: 'movies', contentType: 'movie' })
      .returning();

    await replayMigration(db);

    const [after] = await db.select().from(mediaQueries).where(eq(mediaQueries.id, legacy.id));
    const [untouched] = await db.select().from(mediaQueries).where(eq(mediaQueries.id, movies.id));
    expect(after.contentType).toBe('series');
    expect(untouched.contentType).toBe('movie');
  });
});
