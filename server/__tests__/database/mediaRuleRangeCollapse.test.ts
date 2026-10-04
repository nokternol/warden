import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0013_media_rule_range_collapse';

/** A pre-migration install holding one query whose filter rows are `filters`. */
async function legacyQuery(client: Client, contentType: string, filters: [string, string][]) {
  await client.execute({
    sql: "INSERT INTO media_queries (name, contentType) VALUES ('legacy', ?)",
    args: [contentType],
  });
  for (const [filterKey, value] of filters) {
    await client.execute({
      sql: 'INSERT INTO media_query_filter_values (mediaQueryId, filterKey, value) VALUES (1, ?, ?)',
      args: [filterKey, value],
    });
  }
}

async function storedFilters(client: Client) {
  const result = await client.execute(
    'SELECT filterKey, value FROM media_query_filter_values WHERE mediaQueryId = 1 ORDER BY filterKey'
  );
  return result.rows.map((r) => ({ key: r.filterKey as string, value: r.value as string }));
}

describe('migration 0013 — range rule collapse (data transform)', () => {
  it('merges a Gte/Lte pair into one range-shaped row', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client, 'movie', [
      ['imdbRatingGte', '7.5'],
      ['imdbRatingLte', '9'],
    ]);

    await applyMigration(client, MIGRATION);

    const rows = await storedFilters(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('imdbRating');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 7.5, max: 9 });
  });

  it('preserves a lone bound (no matching Gte/Lte partner) as a partial range', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client, 'series', [['lastAiredDaysAgoGte', '30']]);

    await applyMigration(client, MIGRATION);

    const rows = await storedFilters(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('lastAiredDaysAgo');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 30 });
  });

  it('collapses yearMin/yearMax into a single year range row', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client, 'movie', [
      ['yearMin', '2000'],
      ['yearMax', '2010'],
    ]);

    await applyMigration(client, MIGRATION);

    const rows = await storedFilters(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('year');
    expect(JSON.parse(rows[0].value)).toEqual({ min: 2000, max: 2010 });
  });

  it('leaves unrelated (non-range) filter keys untouched', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client, 'movie', [
      ['hasFile', 'true'],
      ['imdbRatingGte', '5'],
    ]);

    await applyMigration(client, MIGRATION);

    expect((await storedFilters(client)).map((r) => r.key)).toEqual(['hasFile', 'imdbRating']);
  });
});
