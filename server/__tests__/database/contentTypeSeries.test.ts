import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0026_content_type_series';

async function column(client: Client, sqlText: string) {
  return (await client.execute(sqlText)).rows.map((r) => r[0]);
}

describe('migration 0026 — stored show content types become series', () => {
  it('reads a stored show query back as series and leaves movie queries alone', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute(
      "INSERT INTO media_queries (name, contentType) VALUES ('was show', 'show')"
    );
    await client.execute(
      "INSERT INTO media_queries (name, contentType) VALUES ('movies', 'movie')"
    );

    await applyMigration(client, MIGRATION);

    expect(await column(client, 'SELECT contentType FROM media_queries ORDER BY id')).toEqual([
      'series',
      'movie',
    ]);
  });

  it('reads a stored show identity back as series and leaves movie identities alone', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute("INSERT INTO media_identity (kind, tvdbId) VALUES ('show', 81189)");
    await client.execute("INSERT INTO media_identity (kind, tmdbId) VALUES ('movie', 603)");

    await applyMigration(client, MIGRATION);

    expect(await column(client, 'SELECT kind FROM media_identity ORDER BY id')).toEqual([
      'series',
      'movie',
    ]);
  });

  it('keeps one series identity per tvdbId once migrated', async () => {
    const client = await databaseBefore(MIGRATION);
    await applyMigration(client, MIGRATION);
    await client.execute("INSERT INTO media_identity (kind, tvdbId) VALUES ('series', 81189)");

    await expect(
      client.execute("INSERT INTO media_identity (kind, tvdbId) VALUES ('series', 81189)")
    ).rejects.toThrow();
  });
});
