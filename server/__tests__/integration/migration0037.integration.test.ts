/**
 * Verifies the migration that names the stored rule key `ruleKey` and the stored content type
 * `contentType`: both are renames in place, so every row, value and index survives under the new name.
 */
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigration, columnNames, databaseBefore } from '../database/migrationHarness';

const TAG = '0037_rule_key_content_type';
let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

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

  it('keeps each grouped title under the contentType column, a movie and a series sharing an id staying separate', async () => {
    client = await databaseBefore(TAG);
    await client.executeMultiple(`
      INSERT INTO media_identity (id, kind, tmdbId, title, year) VALUES (1, 'movie', 603, 'The Matrix', 1999);
      INSERT INTO media_identity (id, kind, tmdbId, tvdbId, title, year) VALUES (2, 'series', 603, 81189, 'Breaking Bad', 2008);
    `);

    await applyMigration(client, TAG);

    const rows = await client.execute(
      'SELECT id, contentType, tmdbId, title FROM media_identity ORDER BY id'
    );
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([
      { id: 1, contentType: 'movie', tmdbId: 603, title: 'The Matrix' },
      { id: 2, contentType: 'series', tmdbId: 603, title: 'Breaking Bad' },
    ]);
    expect(await columnNames(client, 'media_identity')).not.toContain('kind');
  });

  it('still allows one movie group per TMDB id and one series group per TVDB id', async () => {
    client = await databaseBefore(TAG);
    await applyMigration(client, TAG);

    await client.execute("INSERT INTO media_identity (contentType, tmdbId) VALUES ('movie', 1)");
    await client.execute("INSERT INTO media_identity (contentType, tmdbId) VALUES ('series', 1)");
    await expect(
      client.execute("INSERT INTO media_identity (contentType, tmdbId) VALUES ('movie', 1)")
    ).rejects.toThrow();

    await client.execute("INSERT INTO media_identity (contentType, tvdbId) VALUES ('series', 7)");
    await client.execute("INSERT INTO media_identity (contentType, tvdbId) VALUES ('movie', 7)");
    await expect(
      client.execute("INSERT INTO media_identity (contentType, tvdbId) VALUES ('series', 7)")
    ).rejects.toThrow();
  });
});
