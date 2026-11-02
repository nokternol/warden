import fs from 'node:fs';
import path from 'node:path';
/**
 * Verifies the migration that moves saved file-size filters from bytes to GB: the filter key is
 * renamed and each stored bound is divided by 1,073,741,824, while other filters are untouched.
 */
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

let client: ReturnType<typeof createClient> | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

function migrationSql(): string {
  const file = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith('0032_'));
  if (!file) throw new Error('migration 0032 not found');
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}

describe('migration 0032: file size filters in GB', () => {
  it('renames a saved byte-size filter and converts both bounds to GB', async () => {
    client = createClient({ url: ':memory:' });
    await client.executeMultiple(`
      CREATE TABLE media_query_filter_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mediaQueryId INTEGER NOT NULL,
        filterKey TEXT NOT NULL,
        value TEXT NOT NULL
      );
      INSERT INTO media_query_filter_values (mediaQueryId, filterKey, value) VALUES
        (1, 'fileSizeBytes', '{"min":2147483648,"max":10737418240}'),
        (1, 'fileSizeBytes', '{"max":5368709120}'),
        (1, 'year', '{"min":2000}');
    `);

    await client.executeMultiple(migrationSql());

    const rows = await client.execute(
      'SELECT filterKey, value FROM media_query_filter_values ORDER BY id'
    );
    expect(rows.rows.map((r) => [r.filterKey, JSON.parse(String(r.value))])).toEqual([
      ['fileSizeGb', { min: 2, max: 10 }],
      ['fileSizeGb', { max: 5 }],
      ['year', { min: 2000 }],
    ]);
  });
});
