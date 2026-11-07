/**
 * Filter readiness, as the container builds it, learns the latest enrichment outcome from the
 * run history `automations` owns.
 *
 * Run: vitest run --project server
 */
import { buildContainer } from '@server/container';
import { automationRuns, automations } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

describe('the enrichment outcome filter readiness reads', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it("is the enrichment task's latest run status, not another task's", async () => {
    const db = getDb();
    const [enrichment, identity] = await db
      .insert(automations)
      .values([
        { name: 'Enrichment', kind: 'system', taskId: 'system:enrichment', schedule: '0 * * * *' },
        {
          name: 'Identity',
          kind: 'system',
          taskId: 'system:identity-resolution',
          schedule: '0 * * * *',
        },
      ])
      .returning();
    await db.insert(automationRuns).values([
      { automationId: enrichment.id, status: 'success', kind: 'system' },
      { automationId: enrichment.id, status: 'error', kind: 'system' },
      { automationId: identity.id, status: 'success', kind: 'system' },
    ]);

    const facts = await buildContainer({
      config: testConfig,
      db,
    }).cradle.filterReadiness.readFacts();

    expect(facts.latestEnrichment).toBe('error');
  });
});
