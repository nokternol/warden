import { MetadataProviderType } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import { AutomationBlockService } from '@server/modules/automations/automationBlockService';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import type { Filter } from '@server/modules/media';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import {
  ProviderSettingsService,
  type RadarrMovie,
  RadarrProvider,
} from '@server/modules/providers';
import { createRadarrMovie } from '@tests/factories';
/**
 * A run acts on the titles its automation's conditions select (north-star belief 3): a title is
 * every edition of it everywhere, so it is selected when any instance's copy meets a condition,
 * and the acting service acts on every copy of it the service holds.
 */
import { executorCollaborators } from '@tests/helpers/collaborators';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { libraryCacheHolding } from '@tests/helpers/library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

const log = getChildLogger('selectedTitles');

describe('runs act on the titles their conditions select', () => {
  let providerSettingsService: ProviderSettingsService;
  let automationService: AutomationService;
  let mediaQueryService: MediaQueryService;
  let automationRunService: AutomationRunService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    const db = getDb();
    providerSettingsService = new ProviderSettingsService({ db });
    automationService = new AutomationService({ db });
    mediaQueryService = new MediaQueryService({ db, filterReadiness: filterReadinessOver(db) });
    automationRunService = new AutomationRunService({ db });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  /** Two Radarr instances; A deletes movies. */
  async function twoRadarrs() {
    const a = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr A',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'k',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    const b = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr B',
      url: 'http://localhost:7879/api/v3',
      apiKey: 'k',
    });
    return { a: a.id, b: b.id };
  }

  /** Runs a Radarr-A delete over these copies with one included query, returning what it deleted. */
  async function deleteOnA(
    ids: { a: number; b: number },
    held: { a: RadarrMovie[]; b: RadarrMovie[] },
    filters: Filter[]
  ) {
    const db = getDb();
    const radarrA = new RadarrProvider(
      { name: 'Radarr A', url: 'http://localhost:7878/api/v3', apiKey: 'k', settings: {} },
      log
    );
    const deleteMovies = vi.spyOn(radarrA, 'deleteMovies').mockResolvedValue(undefined);
    const executor = new AutomationExecutor({
      ...executorCollaborators(),
      automationService,
      automationRunService,
      providerSettingsService,
      mediaQueryService,
      automationBlockService: new AutomationBlockService({ db }),
      filterReadiness: filterReadinessOver(db),
      providerFactory: { create: () => radarrA },
      libraryCache: libraryCacheHolding([
        { providerId: ids.a, rows: held.a },
        { providerId: ids.b, rows: held.b },
      ]),
    });
    const query = await mediaQueryService.create({ name: 'Q', contentType: 'movie', filters });
    const automation = await automationService.create({
      name: 'Clean Radarr A',
      queries: [{ queryId: query.id, role: 'include' }],
      providerId: ids.a,
      taskId: 'deleteMovieWithFiles',
      schedule: '0 2 * * *',
    });
    await executor.execute(automation.id);
    const [run] = await automationRunService.listRuns({ automationId: automation.id });
    return { run, deleted: deleteMovies.mock.calls[0]?.[0] ?? [] };
  }

  it("acts on its own copy of a title selected only through another instance's copy", async () => {
    const ids = await twoRadarrs();

    const { deleted } = await deleteOnA(
      ids,
      {
        a: [
          createRadarrMovie({ id: 1, tmdbId: 100, title: 'Heat', hasFile: true }),
          createRadarrMovie({ id: 2, tmdbId: 200, title: 'Ronin', hasFile: true }),
        ],
        b: [createRadarrMovie({ id: 9, tmdbId: 100, title: 'Heat', hasFile: false })],
      },
      [{ ruleKey: 'hasFile', value: false }]
    );

    expect(deleted).toEqual([1]);
  });
});
