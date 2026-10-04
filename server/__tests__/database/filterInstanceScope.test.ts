import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0029_filter_instance_scope';

async function legacyQuery(client: Client) {
  await client.execute(
    "INSERT INTO metadata_provider (name, type, url) VALUES ('Radarr', 'RADARR', 'http://radarr')"
  );
  await client.execute("INSERT INTO media_queries (name, contentType) VALUES ('q', 'movie')");
}

async function insertLegacy(
  client: Client,
  filterKey: string,
  value: string,
  providerId: number | null
) {
  await client.execute({
    sql: 'INSERT INTO media_query_filter_values (mediaQueryId, filterKey, value, providerId) VALUES (1, ?, ?, ?)',
    args: [filterKey, value, providerId],
  });
}

async function storedValues(client: Client) {
  const result = await client.execute(
    'SELECT filterKey, value FROM media_query_filter_values ORDER BY id'
  );
  return result.rows.map((r) => [r.filterKey, r.value]);
}

describe('migration 0029 — instance-scoped filter values name their instance', () => {
  it('folds a qualified csv-ids value and its providerId into { providerId, ids }', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client);
    await insertLegacy(client, 'tagIds', '1, 2', 1);

    await applyMigration(client, MIGRATION);

    const [[, value]] = await storedValues(client);
    expect(JSON.parse(value as string)).toEqual({ providerId: 1, ids: [1, 2] });
  });

  it('reads an unqualified csv-ids value back as { ids }', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client);
    await insertLegacy(client, 'qualityProfileIds', '5', null);
    await insertLegacy(client, 'languageProfileIds', '3,4', null);

    await applyMigration(client, MIGRATION);

    const values = (await storedValues(client)).map(([, v]) => JSON.parse(v as string));
    expect(values).toEqual([{ ids: [5] }, { ids: [3, 4] }]);
  });

  it('leaves values of every other rule exactly as stored', async () => {
    const client = await databaseBefore(MIGRATION);
    await legacyQuery(client);
    await insertLegacy(client, 'hasFile', 'true', null);
    await insertLegacy(client, 'imdbRating', '{"min":7}', null);
    await insertLegacy(client, 'genres', 'Drama,Comedy', null);

    await applyMigration(client, MIGRATION);

    expect(await storedValues(client)).toEqual([
      ['hasFile', 'true'],
      ['imdbRating', '{"min":7}'],
      ['genres', 'Drama,Comedy'],
    ]);
  });

  it('removes the providerId column', async () => {
    const client = await databaseBefore(MIGRATION);

    await applyMigration(client, MIGRATION);

    const columns = (await client.execute('PRAGMA table_info(media_query_filter_values)')).rows.map(
      (r) => r.name
    );
    expect(columns).toEqual(['id', 'mediaQueryId', 'filterKey', 'value']);
  });
});
