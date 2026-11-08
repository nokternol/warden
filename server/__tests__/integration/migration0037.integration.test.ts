/**
 * Verifies the migration that names the stored rule key `ruleKey` and the stored content type
 * `contentType`: both are renames in place, so every row, value and index survives under the new name.
 */
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from '../database/migrationHarness';

const TAG = '0037_rule_key_content_type';
let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

async function columnNames(db: Client, table: string): Promise<string[]> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  return info.rows.map((r) => String(r.name));
}

describe('migration 0037: rule key and content type column names', () => {
  it('reads saved query filters back unchanged under the ruleKey column', async () => {
    client = await databaseBefore(TAG);
    await client.executeMultiple(`
      INSERT INTO media_queries (id, name, contentType) VALUES (1, 'Old and unwatched', 'movie');
      INSERT INTO media_query_filter_values (mediaQueryId, filterKey, value) VALUES
        (1, 'monitored', 'true'),
        (1, 'fileSizeGb', '{"min":5}'),
        (1, 'retiredRule', 'x');
    `);

    await applyMigration(client, TAG);

    const rows = await client.execute(
      'SELECT mediaQueryId, ruleKey, value FROM media_query_filter_values ORDER BY id'
    );
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([
      { mediaQueryId: 1, ruleKey: 'monitored', value: 'true' },
      { mediaQueryId: 1, ruleKey: 'fileSizeGb', value: '{"min":5}' },
      { mediaQueryId: 1, ruleKey: 'retiredRule', value: 'x' },
    ]);
    expect(await columnNames(client, 'media_query_filter_values')).not.toContain('filterKey');
  });
});
