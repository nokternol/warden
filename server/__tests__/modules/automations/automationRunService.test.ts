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
import {
  AutomationRunService,
  type RunTargets,
} from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import type { NormalizedMovie } from '@server/modules/media';
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
    queries: [{ queryId: query.id, role: 'include' }],
    providerId: provider.id,
    taskId: 'unmonitorMovie',
    schedule: '0 2 * * *',
  });

  return { automation, provider };
}

/** A Radarr catalog item as the executor targets it. */
function catalogMovie(providerId: number, radarrId: number, title: string): NormalizedMovie {
  return { _sourceIds: { radarr: radarrId, providerId, tmdb: radarrId * 100 }, title };
}

/** A movie query's run targets. */
function movies(...items: NormalizedMovie[]): RunTargets {
  return { contentType: 'movie', items };
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

    it('records a source copy targeted twice once', async () => {
      const { automation, provider } = await seedFixtures();
      const heat = catalogMovie(provider.id, 1, 'Heat');

      await expect(
        service.createRun({
          automationId: automation.id,
          status: 'success',
          targets: movies(heat, heat),
        })
      ).resolves.toMatchObject({ status: 'success' });

      const [run] = await service.listRuns({ automationId: automation.id });
      const items = await service.listRunItems(run.id);
      expect(items.data.map((i) => i.title)).toEqual(['Heat']);
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
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '* * * * *',
      });
      const auto2 = await automationService.create({
        name: 'Auto 2',
        queries: [{ queryId: query.id, role: 'include' }],
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

  // ─── listItemRuns ─────────────────────────────────────────────────────────

  describe('listItemRuns', () => {
    it('lists the runs that targeted an item, newest first', async () => {
      const { automation, provider } = await seedFixtures();
      const heat = catalogMovie(provider.id, 1, 'Heat');
      const ronin = catalogMovie(provider.id, 2, 'Ronin');

      const first = await service.createRun({
        automationId: automation.id,
        status: 'success',
        targets: movies(heat),
      });
      await service.createRun({
        automationId: automation.id,
        status: 'success',
        targets: movies(ronin),
      });
      const third = await service.createRun({
        automationId: automation.id,
        status: 'error',
        targets: movies(heat, ronin),
      });
      const [heatCopy] = (await service.listRunItems(first.id)).data;

      const runs = await service.listItemRuns(heatCopy.mediaItemId);

      expect(runs.map((r) => r.id)).toEqual([third.id, first.id]);
    });
  });

  // ─── listRunItems ─────────────────────────────────────────────────────────

  describe('listRunItems', () => {
    it("pages a run's items by title, with the total across all pages", async () => {
      const { automation, provider } = await seedFixtures();
      const titles = ['Heat', 'Alien', 'Ronin', 'Brazil', 'Collateral'];
      const run = await service.createRun({
        automationId: automation.id,
        status: 'success',
        targets: movies(...titles.map((title, i) => catalogMovie(provider.id, i + 1, title))),
      });

      const page1 = await service.listRunItems(run.id, { limit: 2, offset: 0 });
      const page2 = await service.listRunItems(run.id, { limit: 2, offset: 2 });

      expect(page1.data.map((i) => i.title)).toEqual(['Alien', 'Brazil']);
      expect(page2.data.map((i) => i.title)).toEqual(['Collateral', 'Heat']);
      expect(page1.total).toBe(5);
    });
  });
});
