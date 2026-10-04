import type { Client } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from './migrationHarness';

async function rows(client: Client, query: string) {
  return (await client.execute(query)).rows.map((r) => ({ ...r }));
}

describe('migration 0028 — automation_query_sources becomes automation_queries', () => {
  it('keeps an automation’s included and excluded queries intact', async () => {
    const client = await databaseBefore('0028_automation_queries');
    await client.execute(
      "INSERT INTO metadata_provider (name, type, url) VALUES ('Radarr', 'RADARR', 'http://radarr')"
    );
    await client.execute(
      "INSERT INTO automations (name, providerId, taskId, schedule) VALUES ('A', 1, 'sync', '0 * * * *')"
    );
    await client.execute("INSERT INTO media_queries (name, contentType) VALUES ('inc', 'movie')");
    await client.execute("INSERT INTO media_queries (name, contentType) VALUES ('exc', 'movie')");
    await client.execute(
      "INSERT INTO automation_query_sources (automationId, queryId, role, sortOrder) VALUES (1, 1, 'include', 0), (1, 2, 'exclude', 1)"
    );

    await applyMigration(client, '0028_automation_queries');

    const tables = (await rows(client, "SELECT name FROM sqlite_master WHERE type = 'table'")).map(
      (r) => r.name
    );
    expect(tables).toContain('automation_queries');
    expect(tables).not.toContain('automation_query_sources');
    expect(
      await rows(
        client,
        'SELECT automationId, queryId, role, sortOrder FROM automation_queries ORDER BY sortOrder'
      )
    ).toEqual([
      { automationId: 1, queryId: 1, role: 'include', sortOrder: 0 },
      { automationId: 1, queryId: 2, role: 'exclude', sortOrder: 1 },
    ]);
  });
});
