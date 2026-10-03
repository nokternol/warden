import { automations } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ensureSystemJobs } from '@server/modules/system/ensureSystemJobs';
import { eq } from 'drizzle-orm';
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

describe('ensureSystemJobs()', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('inserts system:identity-resolution when absent', async () => {
    const db = getDb();
    await ensureSystemJobs(db);

    const rows = await db
      .select()
      .from(automations)
      .where(eq(automations.name, 'system:identity-resolution'));

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('system');
    expect(rows[0].schedule).toBe('0 * * * *');
  });

  it('is idempotent — calling twice still yields exactly 2 system rows', async () => {
    const db = getDb();
    await ensureSystemJobs(db);
    await ensureSystemJobs(db);

    const rows = await db.select().from(automations).where(eq(automations.kind, 'system'));

    expect(rows).toHaveLength(2);
  });

  it('inserts system:enrichment when absent', async () => {
    const db = getDb();
    await ensureSystemJobs(db);

    const rows = await db
      .select()
      .from(automations)
      .where(eq(automations.name, 'system:enrichment'));

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('system');
    expect(rows[0].schedule).toBe('0 */6 * * *');
  });
});
