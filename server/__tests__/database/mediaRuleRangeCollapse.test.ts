import fs from 'node:fs';
import path from 'node:path';
import { mediaQueries, mediaQueryFilterValues } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
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

// Replays migration 0013's SQL against rows shaped like a pre-migration install, to
// guard the transform itself (not just that it runs without throwing on an empty DB,
// which every other integration test already exercises via initializeDatabase).
async function replayRangeCollapseMigration(db: ReturnType<typeof getDb>) {
  const migrationPath = path.resolve(
    __dirname,
    '../../database/migrations/0013_media_rule_range_collapse.sql'
  );
  const contents = fs.readFileSync(migrationPath, 'utf-8');
  const statements = contents
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

describe('migration 0013 — range rule collapse (data transform)', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('merges a Gte/Lte pair into one range-shaped row', async () => {
    const db = getDb();
    const [query] = await db
      .insert(mediaQueries)
      .values({ name: 'Legacy Query', contentType: 'movie' })
      .returning();

    await db.insert(mediaQueryFilterValues).values([
      { mediaQueryId: query.id, filterKey: 'imdbRatingGte', value: '7.5' },
      { mediaQueryId: query.id, filterKey: 'imdbRatingLte', value: '9' },
    ]);

    await replayRangeCollapseMigration(db);

    const rows = await db
      .select()
      .from(mediaQueryFilterValues)
      .where(eq(mediaQueryFilterValues.mediaQueryId, query.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].filterKey).toBe('imdbRating');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 7.5, max: 9 });
  });

  it('preserves a lone bound (no matching Gte/Lte partner) as a partial range', async () => {
    const db = getDb();
    const [query] = await db
      .insert(mediaQueries)
      .values({ name: 'Min-only Query', contentType: 'show' })
      .returning();

    await db
      .insert(mediaQueryFilterValues)
      .values([{ mediaQueryId: query.id, filterKey: 'lastAiredDaysAgoGte', value: '30' }]);

    await replayRangeCollapseMigration(db);

    const rows = await db
      .select()
      .from(mediaQueryFilterValues)
      .where(eq(mediaQueryFilterValues.mediaQueryId, query.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].filterKey).toBe('lastAiredDaysAgo');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 30 });
  });

  it('collapses yearMin/yearMax into a single year range row', async () => {
    const db = getDb();
    const [query] = await db
      .insert(mediaQueries)
      .values({ name: 'Year Query', contentType: 'movie' })
      .returning();

    await db.insert(mediaQueryFilterValues).values([
      { mediaQueryId: query.id, filterKey: 'yearMin', value: '2000' },
      { mediaQueryId: query.id, filterKey: 'yearMax', value: '2010' },
    ]);

    await replayRangeCollapseMigration(db);

    const rows = await db
      .select()
      .from(mediaQueryFilterValues)
      .where(eq(mediaQueryFilterValues.mediaQueryId, query.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].filterKey).toBe('year');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 2000, max: 2010 });
  });

  it('leaves unrelated (non-range) filter keys untouched', async () => {
    const db = getDb();
    const [query] = await db
      .insert(mediaQueries)
      .values({ name: 'Mixed Query', contentType: 'movie' })
      .returning();

    await db.insert(mediaQueryFilterValues).values([
      { mediaQueryId: query.id, filterKey: 'hasFile', value: 'true' },
      { mediaQueryId: query.id, filterKey: 'imdbRatingGte', value: '5' },
    ]);

    await replayRangeCollapseMigration(db);

    const rows = await db
      .select()
      .from(mediaQueryFilterValues)
      .where(eq(mediaQueryFilterValues.mediaQueryId, query.id));

    const keys = rows.map((r) => r.filterKey).sort();
    expect(keys).toEqual(['hasFile', 'imdbRating']);
  });
});
