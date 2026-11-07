/**
 * Stored sign-offs for the filter findings a user can accept, kept in step with each check.
 *
 * Run: vitest run --project server
 */
import type { ReadinessFinding } from '@contract/readiness';
import { automationBlocks, automations } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ConflictError } from '@server/kernel/errors';
import { AutomationBlockService } from '@server/modules/automations/automationBlockService';
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

const noData = (id: string): ReadinessFinding => ({
  id,
  kind: 'no-data',
  queryId: 1,
  ruleKey: 'seerrRequestStatus',
  providerIds: [4],
  message: 'm',
  clears: 'c',
});

describe('AutomationBlockService', () => {
  let service: AutomationBlockService;
  let automationId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    service = new AutomationBlockService({ db: getDb() });
    const [row] = await getDb()
      .insert(automations)
      .values({ name: 'A', taskId: 't', schedule: '0 2 * * *' })
      .returning();
    automationId = row.id;
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  const storedIds = async () =>
    (await getDb().select().from(automationBlocks)).map((b) => b.findingId).sort();

  it('stores a block for each new finding, and deletes the blocks whose finding is gone', async () => {
    await service.reconcile(automationId, [noData('a'), noData('b')]);
    expect(await storedIds()).toEqual(['a', 'b']);

    await service.reconcile(automationId, [noData('b')]);
    expect(await storedIds()).toEqual(['b']);
  });

  it('answers which current findings are signed off', async () => {
    await service.reconcile(automationId, [noData('a'), noData('b')]);
    await service.signOff(automationId, 'a');

    expect(await service.reconcile(automationId, [noData('a'), noData('b')])).toEqual(
      new Set(['a'])
    );
  });

  it('treats a finding that cleared and came back as a new block, not yet signed off', async () => {
    await service.reconcile(automationId, [noData('a')]);
    await service.signOff(automationId, 'a');
    await service.reconcile(automationId, []);

    expect(await service.reconcile(automationId, [noData('a')])).toEqual(new Set());
  });

  it('refuses to sign off a block the latest check no longer found', async () => {
    await service.reconcile(automationId, [noData('a')]);
    await service.reconcile(automationId, []);

    await expect(service.signOff(automationId, 'a')).rejects.toThrow(ConflictError);
    expect(await storedIds()).toEqual([]);
  });
});
