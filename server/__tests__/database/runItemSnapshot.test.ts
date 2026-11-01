import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0031_run_item_snapshot';

describe('migration 0031 — run items keep their titles', () => {
  it('copies title and year onto existing links, and a removed copy leaves its link', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute(
      "INSERT INTO metadata_provider (id, name, type, url, isActive) VALUES (1, 'Radarr', 'RADARR', 'http://r', 1)"
    );
    await client.execute(
      "INSERT INTO media_identity (id, kind, tmdbId, title, year) VALUES (1, 'movie', 603, 'The Matrix', 1999)"
    );
    await client.execute(
      'INSERT INTO media_item (id, providerId, mediaIdentityId, externalId) VALUES (1, 1, 1, 603)'
    );
    await client.execute(
      "INSERT INTO automations (id, name, taskId, schedule, status) VALUES (1, 'A', 'unmonitorMovie', '0 2 * * *', 'active')"
    );
    await client.execute(
      "INSERT INTO automation_runs (id, automationId, ranAt, status) VALUES (1, 1, '2026-01-01', 'success')"
    );
    await client.execute('INSERT INTO automation_run_items (runId, mediaItemId) VALUES (1, 1)');

    await applyMigration(client, MIGRATION);
    await client.execute('PRAGMA foreign_keys = ON');
    await client.execute('DELETE FROM media_identity');

    const { rows } = await client.execute(
      'SELECT runId, mediaItemId, title, year FROM automation_run_items'
    );
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { runId: 1, mediaItemId: null, title: 'The Matrix', year: 1999 },
    ]);
  });
});
