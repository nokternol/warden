import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

const MIGRATION = '0030_owner_only_users';

describe('migration 0030 — an instance keeps only its owner', () => {
  it('keeps the earliest user, the first sign-in, and removes every later one', async () => {
    const client = await databaseBefore(MIGRATION);
    for (const [email, plexId] of [
      ['owner@example.com', 1],
      ['family@example.com', 2],
      ['friend@example.com', 3],
    ] as const) {
      await client.execute({
        sql: 'INSERT INTO user (email, plexId) VALUES (?, ?)',
        args: [email, plexId],
      });
    }

    await applyMigration(client, MIGRATION);

    const rows = await client.execute('SELECT email FROM user');
    expect(rows.rows.map((r) => r.email)).toEqual(['owner@example.com']);
  });
});
