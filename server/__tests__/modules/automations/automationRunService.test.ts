import { MetadataProviderType } from '@server/database/schema';
/**
 * AutomationRunService tests.
 *
 * Uses a real in-memory SQLite DB (migrations applied on each beforeEach).
 * No mocking of persistence — tests the real query contract.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
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

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function seedFixtures() {
  const db = getDb();
  const providerService = new ProviderSettingsService({ db });
  const mediaQueryService = new MediaQueryService({ db });
  const automationService = new AutomationService({ db });

  const provider = await providerService.create({
    type: MetadataProviderType.RADARR,
    name: 'Test Radarr',
    url: 'http://localhost:7878/api/v3',
    apiKey: 'test-key',
    settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
  });
  const query = await mediaQueryService.create({
    name: 'All Movies',
    contentType: 'movie',
    filterValues: [],
  });
  const automation = await automationService.create({
    name: 'Nightly Cleanup',
    querySources: [{ queryId: query.id, role: 'include' }],
    providerId: provider.id,
    taskId: 'unmonitorMovie',
    schedule: '0 2 * * *',
  });

  return { automation };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutomationRunService', () => {
  let service: AutomationRunService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    service = new AutomationRunService({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  // ─── createRun ────────────────────────────────────────────────────────────

  describe('createRun', () => {
    it('persists a success run and returns a dto with automation name', async () => {
      const { automation } = await seedFixtures();

      const dto = await service.createRun({
        automationId: automation.id,
        status: 'success',
        itemCount: 3,
      });

      expect(dto.automationId).toBe(automation.id);
      expect(dto.automationName).toBe('Nightly Cleanup');
      expect(dto.status).toBe('success');
      expect(dto.itemCount).toBe(3);
      expect(dto.error).toBeNull();
      expect(dto.id).toBeGreaterThan(0);
      expect(dto.ranAt).toBeInstanceOf(Date);
    });

    it('persists an error run with error message', async () => {
      const { automation } = await seedFixtures();

      const dto = await service.createRun({
        automationId: automation.id,
        status: 'error',
        itemCount: 0,
        error: 'Connection refused',
      });

      expect(dto.status).toBe('error');
      expect(dto.error).toBe('Connection refused');
    });

    it('persists a run with null itemCount when omitted', async () => {
      const { automation } = await seedFixtures();

      const dto = await service.createRun({
        automationId: automation.id,
        status: 'success',
      });

      expect(dto.itemCount).toBeNull();
    });
  });

  // ─── listRuns ─────────────────────────────────────────────────────────────

  describe('listRuns', () => {
    it('returns an empty array when no runs exist', async () => {
      const runs = await service.listRuns();
      expect(runs).toEqual([]);
    });

    it('returns runs ordered by ranAt descending', async () => {
      const { automation } = await seedFixtures();

      await service.createRun({ automationId: automation.id, status: 'success', itemCount: 1 });
      await service.createRun({ automationId: automation.id, status: 'error', itemCount: 0 });

      const runs = await service.listRuns();

      expect(runs).toHaveLength(2);
      // Most recent first: the second insert should be first
      expect(runs[0].status).toBe('error');
      expect(runs[1].status).toBe('success');
    });

    it('filters runs by automationId', async () => {
      const db = getDb();
      const providerService = new ProviderSettingsService({ db });
      const mediaQueryService = new MediaQueryService({ db });
      const automationService = new AutomationService({ db });

      const provider = await providerService.create({
        type: MetadataProviderType.RADARR,
        name: 'Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'] },
      });
      const query = await mediaQueryService.create({
        name: 'Q',
        contentType: 'movie',
        filterValues: [],
      });

      const auto1 = await automationService.create({
        name: 'Auto 1',
        querySources: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '* * * * *',
      });
      const auto2 = await automationService.create({
        name: 'Auto 2',
        querySources: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '* * * * *',
      });

      await service.createRun({ automationId: auto1.id, status: 'success' });
      await service.createRun({ automationId: auto2.id, status: 'error' });

      const runs = await service.listRuns({ automationId: auto1.id });

      expect(runs).toHaveLength(1);
      expect(runs[0].automationId).toBe(auto1.id);
    });

    it('respects limit and offset', async () => {
      const { automation } = await seedFixtures();

      await service.createRun({ automationId: automation.id, status: 'success', itemCount: 1 });
      await service.createRun({ automationId: automation.id, status: 'success', itemCount: 2 });
      await service.createRun({ automationId: automation.id, status: 'success', itemCount: 3 });

      const page1 = await service.listRuns({ limit: 2, offset: 0 });
      const page2 = await service.listRuns({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });
});
