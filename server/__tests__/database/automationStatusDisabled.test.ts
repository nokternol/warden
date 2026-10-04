import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0025_automation_status_disabled';

describe('migration 0025 — paused automations become disabled', () => {
  it('reads a stored paused automation back as disabled and leaves active ones alone', async () => {
    const client = await databaseBefore(MIGRATION);
    await client.execute(
      "INSERT INTO metadata_provider (name, type, url) VALUES ('Radarr', 'RADARR', 'http://localhost:7878')"
    );
    for (const [name, status] of [
      ['was paused', 'paused'],
      ['running', 'active'],
    ]) {
      await client.execute({
        sql: "INSERT INTO automations (name, providerId, taskId, schedule, status) VALUES (?, 1, 'sync', '0 * * * *', ?)",
        args: [name, status],
      });
    }

    await applyMigration(client, MIGRATION);

    const rows = await client.execute('SELECT status FROM automations ORDER BY id');
    expect(rows.rows.map((r) => r.status)).toEqual(['disabled', 'active']);
  });
});
