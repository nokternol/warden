/**
 * Verifies the migration that stores facts per provider: facts stored without a provider are
 * deleted, so the next enrichment run reads every enricher again, and the per-title enrichment
 * time is gone.
 */
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigration, columnNames, databaseBefore } from '../database/migrationHarness';

const TAG = '0039_facts_per_provider';
let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

describe('migration 0039: facts per provider', () => {
  it('deletes facts stored without a provider and drops the enrichment time', async () => {
    client = await databaseBefore(TAG);
    await client.executeMultiple(`
      INSERT INTO media_identity (id, contentType, tmdbId, enrichedAt) VALUES (1, 'movie', 603, 100);
      INSERT INTO media_enrichment (mediaIdentityId, fieldId, value)
        SELECT 1, id, '3' FROM enrichment_field WHERE key = 'playCount';
    `);

    await applyMigration(client, TAG);

    expect((await client.execute('SELECT count(*) AS n FROM media_enrichment')).rows[0].n).toBe(0);
    expect(await columnNames(client, 'media_enrichment')).toContain('providerId');
    expect(await columnNames(client, 'media_identity')).not.toContain('enrichedAt');
    expect((await client.execute('SELECT id FROM media_identity')).rows).toHaveLength(1);
  });
});
