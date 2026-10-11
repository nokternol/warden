import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0030_seerr_request_manager';

async function rows(client: Client, query: string) {
  return (await client.execute(query)).rows.map((r) => ({ ...r }));
}

describe('migration 0030 — the request manager becomes Seerr', () => {
  it('keeps stored request status and issue values, now under seerr field keys', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute("INSERT INTO media_identity (kind, tmdbId) VALUES ('movie', 603)");
    await client.execute(
      `INSERT INTO media_enrichment (mediaIdentityId, fieldId, value)
       SELECT 1, id, CASE key WHEN 'overseerrRequestStatus' THEN '2' ELSE 'true' END
       FROM enrichment_field WHERE key IN ('overseerrRequestStatus', 'overseerrHasIssue')`
    );

    await applyMigration(client, MIGRATION);

    expect(
      await rows(
        client,
        `SELECT f.key AS key, e.value AS value FROM media_enrichment e
         JOIN enrichment_field f ON f.id = e.fieldId ORDER BY f.key`
      )
    ).toEqual([
      { key: 'seerrHasIssue', value: 'true' },
      { key: 'seerrRequestStatus', value: '2' },
    ]);
    expect(
      await rows(client, "SELECT key FROM enrichment_field WHERE key LIKE 'overseerr%'")
    ).toEqual([]);
  });

  it('reads an Overseerr provider back as a Seerr provider, leaving its settings and other providers untouched', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute(
      `INSERT INTO metadata_provider (name, type, url, apiKey, isActive) VALUES
         ('Overseerr', 'OVERSEERR', 'http://overseerr:5055', 'key', 0),
         ('Radarr', 'RADARR', 'http://radarr', NULL, 1)`
    );

    await applyMigration(client, MIGRATION);

    expect(
      await rows(
        client,
        'SELECT name, type, url, apiKey, isActive FROM metadata_provider ORDER BY id'
      )
    ).toEqual([
      {
        name: 'Overseerr',
        type: 'SEERR',
        url: 'http://overseerr:5055',
        apiKey: 'key',
        isActive: 0,
      },
      { name: 'Radarr', type: 'RADARR', url: 'http://radarr', apiKey: null, isActive: 1 },
    ]);
  });
});
