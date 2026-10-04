import { type Scope, scope } from '@contract/scope';
import { MetadataProviderType, automations } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ForbiddenError, ValidationError } from '@server/kernel/errors';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { ProviderSettingsService } from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

const RADARR_TASKS = ['unmonitorMovie', 'triggerSearch', 'deleteMovieWithFiles'];
const SONARR_TASKS = ['unmonitorSeries', 'triggerSearch', 'deleteSeriesWithFiles'];

async function seedProvider(providerService: ProviderSettingsService) {
  return providerService.create({
    type: MetadataProviderType.RADARR,
    name: 'Test Radarr',
    url: 'http://localhost:7878/api/v3',
    apiKey: 'test-key',
    settings: { enabledTasks: RADARR_TASKS },
  });
}

async function seedQuery(queryService: MediaQueryService) {
  return queryService.create({ name: 'Test Query', contentType: 'movie', filters: [] });
}

describe('AutomationService', () => {
  let automationService: AutomationService;
  let providerSettingsService: ProviderSettingsService;
  let mediaQueryService: MediaQueryService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    automationService = new AutomationService({ db });
    providerSettingsService = new ProviderSettingsService({ db });
    mediaQueryService = new MediaQueryService({ db });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  describe('create()', () => {
    it('returns a dto with query.contentType populated from the joined row', async () => {
      const query = await mediaQueryService.create({
        name: 'Movie Query',
        contentType: 'movie',
        filters: [],
      });
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Test Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: RADARR_TASKS },
      });

      const dto = await automationService.create({
        name: 'My Automation',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      expect(dto.query!.contentType).toBe('movie');
    });

    it('returns a dto with query.name and provider.type populated from the joined rows', async () => {
      const query = await mediaQueryService.create({
        name: 'My Query',
        contentType: 'movie',
        filters: [{ ruleKey: 'hasFile', value: true }],
      });
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Test Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: RADARR_TASKS },
      });

      const dto = await automationService.create({
        name: 'My Automation',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      expect(dto.query!.name).toBe('My Query');
      expect(dto.query!.contentType).toBe('movie');
      expect(dto.provider!.name).toBe('Test Radarr');
      expect(dto.provider!.type).toBe(MetadataProviderType.RADARR);
    });

    it('returns createdAt and updatedAt as valid ISO 8601 strings', async () => {
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);

      const dto = await automationService.create({
        name: 'My Automation',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      expect(dto.createdAt).toMatch(ISO_REGEX);
      expect(dto.updatedAt).toMatch(ISO_REGEX);
    });

    it('rejects a taskId not enabled on that provider instance', async () => {
      const query = await seedQuery(mediaQueryService);
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'No Tasks Enabled',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: [] },
      });

      await expect(
        automationService.create({
          name: 'Disabled Task Automation',
          queries: [{ queryId: query.id, role: 'include' }],
          providerId: provider.id,
          taskId: 'unmonitorMovie',
          schedule: '0 * * * *',
        })
      ).rejects.toThrow(/not enabled/i);
    });

    it('rejects a task the scope declaration defers, even when it is enabled', async () => {
      const deferringRadarrSearch: Scope = {
        deferred: {
          ...scope.deferred,
          tasks: [{ providerType: 'RADARR', taskId: 'triggerSearch' }],
        },
      };
      const scoped = new AutomationService({ db: getDb(), scope: deferringRadarrSearch });
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);

      await expect(
        scoped.create({
          name: 'Search',
          queries: [{ queryId: query.id, role: 'include' }],
          providerId: provider.id,
          taskId: 'triggerSearch',
          schedule: '0 * * * *',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('contentType compatibility validation', () => {
    it('throws ValidationError when a SONARR provider is paired with a movie query', async () => {
      const query = await mediaQueryService.create({
        name: 'Movie Query',
        contentType: 'movie',
        filters: [],
      });
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.SONARR,
        name: 'Test Sonarr',
        url: 'http://localhost:8989/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: SONARR_TASKS },
      });

      await expect(
        automationService.create({
          name: 'Bad Automation',
          queries: [{ queryId: query.id, role: 'include' }],
          providerId: provider.id,
          taskId: 'unmonitorSeries',
          schedule: '0 * * * *',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when a RADARR provider is paired with a show query', async () => {
      const query = await mediaQueryService.create({
        name: 'Show Query',
        contentType: 'series',
        filters: [],
      });
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.RADARR,
        name: 'Test Radarr',
        url: 'http://localhost:7878/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: RADARR_TASKS },
      });

      await expect(
        automationService.create({
          name: 'Bad Automation',
          queries: [{ queryId: query.id, role: 'include' }],
          providerId: provider.id,
          taskId: 'unmonitorMovie',
          schedule: '0 * * * *',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('list()', () => {
    it('returns only user automations when kind=user is specified', async () => {
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);
      const db = getDb();

      await automationService.create({
        name: 'User Automation',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });
      await db.insert(automations).values({
        name: 'system:identity-resolution',
        providerId: provider.id,
        taskId: 'identityResolution',
        schedule: '0 * * * *',
        kind: 'system',
      });

      const userOnly = await automationService.list({ kind: 'user' });
      expect(userOnly).toHaveLength(1);
      expect(userOnly[0].name).toBe('User Automation');
    });

    it('returns each automation with createdAt and updatedAt as valid ISO 8601 strings', async () => {
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);

      await automationService.create({
        name: 'Automation A',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });
      await automationService.create({
        name: 'Automation B',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'triggerSearch',
        schedule: '0 0 * * *',
      });

      const dtos = await automationService.list();
      expect(dtos).toHaveLength(2);
      for (const dto of dtos) {
        expect(dto.createdAt).toMatch(ISO_REGEX);
        expect(dto.updatedAt).toMatch(ISO_REGEX);
      }
    });
  });

  describe('getById()', () => {
    it('returns the automation with createdAt and updatedAt as valid ISO 8601 strings', async () => {
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);

      const created = await automationService.create({
        name: 'Automation C',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const found = await automationService.getById(created.id);
      expect(found.createdAt).toMatch(ISO_REGEX);
      expect(found.updatedAt).toMatch(ISO_REGEX);
    });

    it('returns queries array with role and queryId for each source', async () => {
      const provider = await seedProvider(providerSettingsService);
      const queryA = await mediaQueryService.create({
        name: 'Include Q',
        contentType: 'movie',
        filters: [],
      });
      const queryB = await mediaQueryService.create({
        name: 'Exclude Q',
        contentType: 'movie',
        filters: [],
      });

      const created = await automationService.create({
        name: 'Multi-query Automation',
        queries: [
          { queryId: queryA.id, role: 'include', sortOrder: 0 },
          { queryId: queryB.id, role: 'exclude', sortOrder: 1 },
        ],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const found = await automationService.getById(created.id);
      expect(found.queries).toHaveLength(2);
      expect(found.queries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ queryId: queryA.id, role: 'include' }),
          expect.objectContaining({ queryId: queryB.id, role: 'exclude' }),
        ])
      );
    });
  });

  describe('delete()', () => {
    it('throws ForbiddenError when the automation has kind=system', async () => {
      const provider = await seedProvider(providerSettingsService);
      const db = getDb();
      const [row] = await db
        .insert(automations)
        .values({
          name: 'system:identity-resolution',
          providerId: provider.id,
          taskId: 'identityResolution',
          schedule: '0 * * * *',
          kind: 'system',
        })
        .returning();

      await expect(automationService.delete(row.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updateStatus()', () => {
    it('throws ForbiddenError when the automation has kind=system', async () => {
      const provider = await seedProvider(providerSettingsService);
      const db = getDb();
      const [row] = await db
        .insert(automations)
        .values({
          name: 'system:enrichment',
          providerId: provider.id,
          taskId: 'enrichment',
          schedule: '0 */6 * * *',
          kind: 'system',
        })
        .returning();

      await expect(automationService.updateStatus(row.id, 'disabled')).rejects.toThrow(
        ForbiddenError
      );
    });

    it('returns a dto with query.name and provider.type populated from the joined rows', async () => {
      const query = await mediaQueryService.create({
        name: 'Status Query',
        contentType: 'series',
        filters: [],
      });
      const provider = await providerSettingsService.create({
        type: MetadataProviderType.SONARR,
        name: 'Test Sonarr',
        url: 'http://localhost:8989/api/v3',
        apiKey: 'key',
        settings: { enabledTasks: SONARR_TASKS },
      });

      const created = await automationService.create({
        name: 'Status Automation',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorSeries',
        schedule: '0 * * * *',
      });

      const dto = await automationService.updateStatus(created.id, 'disabled');
      expect(dto.status).toBe('disabled');
      expect(dto.query!.name).toBe('Status Query');
      expect(dto.provider!.name).toBe('Test Sonarr');
      expect(dto.provider!.type).toBe(MetadataProviderType.SONARR);
    });

    it('returns updatedAt as a valid ISO 8601 string', async () => {
      const provider = await seedProvider(providerSettingsService);
      const query = await seedQuery(mediaQueryService);

      const created = await automationService.create({
        name: 'Automation D',
        queries: [{ queryId: query.id, role: 'include' }],
        providerId: provider.id,
        taskId: 'unmonitorMovie',
        schedule: '0 * * * *',
      });

      const updated = await automationService.updateStatus(created.id, 'disabled');
      expect(updated.createdAt).toMatch(ISO_REGEX);
      expect(updated.updatedAt).toMatch(ISO_REGEX);
    });
  });
});
