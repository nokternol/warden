import fs from 'node:fs';
import path from 'node:path';
import { MetadataProviderType, automations, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { eq, sql } from 'drizzle-orm';
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

// Replays the migration's SQL against rows shaped like a pre-migration install.
async function replayMigration(db: ReturnType<typeof getDb>) {
  const migrationPath = path.resolve(
    __dirname,
    '../../database/migrations/0025_automation_status_disabled.sql'
  );
  const statements = fs
    .readFileSync(migrationPath, 'utf-8')
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await db.run(sql.raw(statement));
  }
}

describe('migration 0025 — paused automations become disabled', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('reads a stored paused automation back as disabled and leaves active ones alone', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({ name: 'Radarr', type: MetadataProviderType.RADARR, url: 'http://localhost:7878' })
      .returning();
    const base = { providerId: provider.id, taskId: 'sync', schedule: '0 * * * *' };
    const [stored] = await db
      .insert(automations)
      .values({ ...base, name: 'was paused' })
      .returning();
    // `paused` is outside AutomationStatus, so the legacy row is written in raw SQL.
    await db.run(sql`UPDATE automations SET status = 'paused' WHERE id = ${stored.id}`);
    const [running] = await db
      .insert(automations)
      .values({ ...base, name: 'running', status: 'active' })
      .returning();

    await replayMigration(db);

    const [after] = await db.select().from(automations).where(eq(automations.id, stored.id));
    const [stillActive] = await db.select().from(automations).where(eq(automations.id, running.id));
    expect(after.status).toBe('disabled');
    expect(stillActive.status).toBe('active');
  });
});
