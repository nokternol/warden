import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0041_reported_facts_named_for_meaning';

async function rows(client: Client, query: string) {
  return (await client.execute(query)).rows.map((r) => ({ ...r }));
}

describe('migration 0041 — reported facts are named for what they mean', () => {
  it('keeps every stored fact under its new key, merging both media servers’ added dates', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute(
      `INSERT INTO metadata_provider (id, name, type, url) VALUES
         (1, 'Plex', 'PLEX', 'http://p'), (2, 'Jellyfin', 'JELLYFIN', 'http://j'),
         (3, 'Seerr', 'SEERR', 'http://s'), (4, 'TMDB', 'TMDB', 'http://t')`
    );
    await client.execute(
      "INSERT INTO media_identity (id, contentType, tmdbId) VALUES (1, 'movie', 603), (2, 'movie', 604)"
    );
    const fact = (title: number, key: string, provider: number, value: string) =>
      client.execute({
        sql: `INSERT INTO media_enrichment (mediaIdentityId, fieldId, providerId, value)
              SELECT ?, id, ?, ? FROM enrichment_field WHERE key = ?`,
        args: [title, provider, value, key],
      });
    await fact(1, 'plexAddedAt', 1, '"2023-01-01"');
    await fact(1, 'jellyfinAddedAt', 2, '"2022-01-01"');
    await fact(2, 'jellyfinAddedAt', 2, '"2021-01-01"');
    await fact(1, 'isFavorite', 2, 'true');
    await fact(1, 'seerrRequestStatus', 3, '2');
    await fact(1, 'seerrHasIssue', 3, 'true');
    await fact(1, 'tmdbStatus', 4, '"Released"');

    await applyMigration(client, MIGRATION);

    expect(
      await rows(
        client,
        `SELECT f.key AS key, e.mediaIdentityId AS title, e.providerId AS provider, e.value AS value
         FROM media_enrichment e JOIN enrichment_field f ON f.id = e.fieldId
         ORDER BY f.key, e.mediaIdentityId, e.providerId`
      )
    ).toEqual([
      { key: 'addedToMediaServerAt', title: 1, provider: 1, value: '"2023-01-01"' },
      { key: 'addedToMediaServerAt', title: 1, provider: 2, value: '"2022-01-01"' },
      { key: 'addedToMediaServerAt', title: 2, provider: 2, value: '"2021-01-01"' },
      { key: 'hasIssue', title: 1, provider: 3, value: 'true' },
      { key: 'isFavorite', title: 1, provider: 2, value: 'true' },
      { key: 'productionStatus', title: 1, provider: 4, value: '"Released"' },
      { key: 'requestStatus', title: 1, provider: 3, value: '2' },
    ]);
    expect(
      await rows(
        client,
        `SELECT key FROM enrichment_field WHERE key IN
           ('plexAddedAt', 'jellyfinAddedAt', 'seerrRequestStatus', 'seerrHasIssue', 'tmdbStatus')`
      )
    ).toEqual([]);
    expect(await rows(client, 'PRAGMA foreign_key_check')).toEqual([]);
  });
});
