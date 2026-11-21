import { MetadataProviderType, mediaIdentity, mediaItems } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { getChildLogger } from '@server/kernel/logger';
import { AutomationBlockService } from '@server/modules/automations/automationBlockService';
import { AutomationExecutor } from '@server/modules/automations/automationExecutor';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { AutomationService } from '@server/modules/automations/automationService';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { PlexProvider, ProviderSettingsService, RadarrProvider } from '@server/modules/providers';
import { createRadarrMovie } from '@tests/factories';
/**
 * Exclude protection works by title for every actuator: an exclude matching any copy of a title,
 * on any active instance, protects that title.
 */
import { executorCollaborators } from '@tests/helpers/collaborators';
import { filterReadinessOver } from '@tests/helpers/filterReadiness';
import { libraryCacheHolding } from '@tests/helpers/library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const KEEP_TAG = 7;

/** One Radarr copy as the pooled source normalises it. */
interface Copy {
  providerId: number;
  radarrId: number;
  tmdb?: number;
  title: string;
  keep?: boolean;
}

describe('exclude protection', () => {
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

  async function radarr(name: string) {
    return providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name,
      url: `http://localhost:${name === 'Radarr' ? 7878 : 7879}/api/v3`,
      apiKey: 'k',
    });
  }

  /** Records an identity stamped with a Plex rating key, joined by the given copies. */
  async function recordIdentity(
    identity: { tmdbId?: number; title: string; plexRatingKey: string },
    copies: Array<{ providerId: number; radarrId: number }>
  ) {
    const db = getDb();
    const [{ id }] = await db
      .insert(mediaIdentity)
      .values({ contentType: 'movie', ...identity })
      .returning({ id: mediaIdentity.id });
    for (const copy of copies) {
      await db
        .insert(mediaItems)
        .values({ providerId: copy.providerId, externalId: copy.radarrId, mediaIdentityId: id });
    }
  }

  /**
   * A Plex delete automation over the pooled Radarr copies: it includes everything, and excludes
   * copies tagged "keep" on `keepInstance`.
   */
  async function deleteAllButKept(copies: Copy[], keepInstance: number) {
    const db = getDb();
    const plex = await providerSettingsService.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: 'http://localhost:32400',
      apiKey: 'plex-token',
      settings: { enabledTasks: ['deleteFromLibrary'] },
    });
    const plexInstance = new PlexProvider(
      { name: 'Plex', url: 'http://localhost:32400', apiKey: 'plex-token', settings: {} },
      getChildLogger('excludeProtection')
    );
    const deleteFromLibrary = vi
      .spyOn(plexInstance, 'deleteFromLibrary')
      .mockResolvedValue(undefined);
    const executor = new AutomationExecutor({
      ...executorCollaborators(),
      automationService,
      automationRunService,
      providerSettingsService,
      mediaQueryService,
      automationBlockService: new AutomationBlockService({ db }),
      filterReadiness: filterReadinessOver(db),
      providerFactory: { create: () => plexInstance },
      libraryCache: libraryCacheHolding(
        [...new Set(copies.map((c) => c.providerId))].map((providerId) => ({
          providerId,
          rows: copies
            .filter((c) => c.providerId === providerId)
            .map((c) =>
              createRadarrMovie({
                id: c.radarrId,
                tmdbId: c.tmdb,
                title: c.title,
                tags: c.keep ? [KEEP_TAG] : [],
              })
            ),
        }))
      ),
    });
    const everything = await mediaQueryService.create({
      name: 'Everything',
      contentType: 'movie',
      filters: [],
    });
    const kept = await mediaQueryService.create({
      name: 'Kept',
      contentType: 'movie',
      filters: [{ ruleKey: 'tagIds', value: { providerId: keepInstance, ids: [KEEP_TAG] } }],
    });
    const automation = await automationService.create({
      name: 'Clean Plex',
      queries: [
        { queryId: everything.id, role: 'include' },
        { queryId: kept.id, role: 'exclude' },
      ],
      providerId: plex.id,
      taskId: 'deleteFromLibrary',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    const [run] = await automationRunService.listRuns({ automationId: automation.id });
    const runItems = run ? (await automationRunService.listRunItems(run.id)).data : [];
    return {
      run,
      deletedIds: (deleteFromLibrary.mock.calls[0]?.[0] ?? []).slice().sort(),
      recordedTitles: runItems.map((i) => i.title).sort(),
    };
  }

  it('protects a title through an excluded copy the identity job has not recorded yet', async () => {
    const main = await radarr('Radarr');
    const fourK = await radarr('Radarr 4K');
    await recordIdentity({ tmdbId: 100, title: 'Heat', plexRatingKey: 'rk-1' }, [
      { providerId: main.id, radarrId: 1 },
    ]);
    await recordIdentity({ tmdbId: 200, title: 'Ronin', plexRatingKey: 'rk-2' }, [
      { providerId: main.id, radarrId: 2 },
    ]);

    const { deletedIds, recordedTitles } = await deleteAllButKept(
      [
        { providerId: main.id, radarrId: 1, tmdb: 100, title: 'Heat' },
        { providerId: main.id, radarrId: 2, tmdb: 200, title: 'Ronin' },
        // Added to the 4K instance and tagged "keep" since the identity job last ran.
        { providerId: fourK.id, radarrId: 9, tmdb: 100, title: 'Heat', keep: true },
      ],
      fourK.id
    );

    expect(deletedIds).toEqual(['rk-2']);
    expect(recordedTitles).toEqual(['Ronin']);
  });

  it('protects the actuator id, not just the copy, when an identity spans two title keys', async () => {
    const main = await radarr('Radarr');
    const fourK = await radarr('Radarr 4K');
    // The identity graph joined two copies with different TMDB ids into one Plex item.
    await recordIdentity({ tmdbId: 100, title: 'Heat', plexRatingKey: 'rk-1' }, [
      { providerId: main.id, radarrId: 1 },
      { providerId: main.id, radarrId: 3 },
    ]);
    await recordIdentity({ tmdbId: 200, title: 'Ronin', plexRatingKey: 'rk-2' }, [
      { providerId: main.id, radarrId: 2 },
    ]);

    const { deletedIds, recordedTitles } = await deleteAllButKept(
      [
        { providerId: main.id, radarrId: 1, tmdb: 100, title: 'Heat' },
        { providerId: main.id, radarrId: 3, tmdb: 300, title: 'Heat (1995)' },
        { providerId: main.id, radarrId: 2, tmdb: 200, title: 'Ronin' },
        { providerId: fourK.id, radarrId: 9, tmdb: 100, title: 'Heat', keep: true },
      ],
      fourK.id
    );

    expect(deletedIds).toEqual(['rk-2']);
    expect(recordedTitles).toEqual(['Ronin']);
  });

  it("protects a film from a Radarr run on one instance through the other instance's keep tag", async () => {
    const db = getDb();
    const a = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr A',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'k',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    const b = await radarr('Radarr B');
    const radarrA = new RadarrProvider(
      { name: 'Radarr A', url: 'http://localhost:7878/api/v3', apiKey: 'k', settings: {} },
      getChildLogger('excludeProtection')
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
        {
          providerId: a.id,
          rows: [
            createRadarrMovie({ id: 1, tmdbId: 100, title: 'Heat' }),
            createRadarrMovie({ id: 2, tmdbId: 200, title: 'Ronin' }),
          ],
        },
        {
          providerId: b.id,
          rows: [createRadarrMovie({ id: 9, tmdbId: 100, title: 'Heat', tags: [KEEP_TAG] })],
        },
      ]),
    });
    const everything = await mediaQueryService.create({
      name: 'Everything',
      contentType: 'movie',
      filters: [],
    });
    const keptOnB = await mediaQueryService.create({
      name: 'Kept on B',
      contentType: 'movie',
      filters: [{ ruleKey: 'tagIds', value: { providerId: b.id, ids: [KEEP_TAG] } }],
    });
    const automation = await automationService.create({
      name: 'Clean Radarr A',
      queries: [
        { queryId: everything.id, role: 'include' },
        { queryId: keptOnB.id, role: 'exclude' },
      ],
      providerId: a.id,
      taskId: 'deleteMovieWithFiles',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    expect(deleteMovies).toHaveBeenCalledWith([2]);
  });

  it('protects a film from a Radarr run when its copies meet different filters of the exclude', async () => {
    const db = getDb();
    const a = await providerSettingsService.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr A',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'k',
      settings: { enabledTasks: ['deleteMovieWithFiles'] },
    });
    const b = await radarr('Radarr B');
    const radarrA = new RadarrProvider(
      { name: 'Radarr A', url: 'http://localhost:7878/api/v3', apiKey: 'k', settings: {} },
      getChildLogger('excludeProtection')
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
        {
          providerId: a.id,
          rows: [
            createRadarrMovie({ id: 1, tmdbId: 100, title: 'Heat', hasFile: false }),
            createRadarrMovie({ id: 2, tmdbId: 200, title: 'Ronin', hasFile: false }),
          ],
        },
        {
          providerId: b.id,
          rows: [
            createRadarrMovie({
              id: 9,
              tmdbId: 100,
              title: 'Heat',
              hasFile: true,
              tags: [KEEP_TAG],
            }),
          ],
        },
      ]),
    });
    const everything = await mediaQueryService.create({
      name: 'Everything',
      contentType: 'movie',
      filters: [],
    });
    const keptOnBMissingSomewhere = await mediaQueryService.create({
      name: 'Kept on B, missing a file somewhere',
      contentType: 'movie',
      filters: [
        { ruleKey: 'tagIds', value: { providerId: b.id, ids: [KEEP_TAG] } },
        { ruleKey: 'hasFile', value: false },
      ],
    });
    const automation = await automationService.create({
      name: 'Clean Radarr A',
      queries: [
        { queryId: everything.id, role: 'include' },
        { queryId: keptOnBMissingSomewhere.id, role: 'exclude' },
      ],
      providerId: a.id,
      taskId: 'deleteMovieWithFiles',
      schedule: '0 2 * * *',
    });

    await executor.execute(automation.id);

    expect(deleteMovies).toHaveBeenCalledWith([2]);
  });
});
