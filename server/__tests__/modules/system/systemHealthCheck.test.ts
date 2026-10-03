import { automations } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { systemHealthCheck } from '@server/modules/system/systemHealthCheck';
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

describe('systemHealthCheck()', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('resolves without error and seeds system jobs', async () => {
    const db = getDb();
    await expect(systemHealthCheck(db)).resolves.toBeUndefined();

    const systemRows = await db
      .select({ name: automations.name })
      .from(automations)
      .where(eq(automations.kind, 'system'));

    expect(systemRows).toHaveLength(2);
  });
});
