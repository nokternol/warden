import { MetadataProviderType, mediaIdentity, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { EnrichmentJob } from '@server/modules/media/enrichmentJob';
import type { ReportedFactKey, ReportedFacts, TitleIdColumn } from '@server/modules/providers';
import { readRefreshRecords } from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

/** A reporter answering `answer` for the ids it is asked about, matched by `titleIdColumn`. */
function fakeReporter(
  providerId: number,
  name: string,
  titleIdColumn: TitleIdColumn,
  reports: readonly ReportedFactKey[],
  answer: (ids: readonly (string | number)[]) => Map<string | number, Partial<ReportedFacts>>
) {
  const readReportedFacts = vi.fn(async (ids: readonly (string | number)[]) => answer(ids));
  return { providerId, name, titleIdColumn, reports, provider: { readReportedFacts } };
}

describe('EnrichmentJob', () => {
  let queries: EnrichmentQueries;
  let tautulliId: number;
  let plexId: number;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    queries = new EnrichmentQueries({ db: getDb() });
    [{ id: tautulliId }, { id: plexId }] = await getDb()
      .insert(metadataProviders)
      .values([
        { type: MetadataProviderType.TAUTULLI, name: 'Tautulli', url: 'http://t' },
        { type: MetadataProviderType.PLEX, name: 'Plex', url: 'http://p' },
      ])
      .returning({ id: metadataProviders.id });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  async function title(values: Partial<typeof mediaIdentity.$inferInsert> = {}) {
    const [row] = await getDb()
      .insert(mediaIdentity)
      .values({ contentType: 'movie', plexRatingKey: 'k', ...values })
      .returning();
    return row.id;
  }

  function job(reporters: ReturnType<typeof fakeReporter>[]) {
    return new EnrichmentJob({ db: getDb(), enrichmentQueries: queries, reporters });
  }

  it("stores each reporter's facts under its own provider and records the refresh", async () => {
    const id = await title();
    const tautulli = fakeReporter(
      tautulliId,
      'Tautulli',
      'plexRatingKey',
      ['playCount'],
      () => new Map([['k', { playCount: 5 }]])
    );
    const plex = fakeReporter(
      plexId,
      'Plex',
      'plexRatingKey',
      ['playCount', 'studio'],
      () => new Map([['k', { playCount: 2, studio: 'Legendary' }]])
    );

    await job([tautulli, plex]).run();

    expect(await queries.allFacts()).toEqual(
      expect.arrayContaining([
        { mediaIdentityId: id, providerId: tautulliId, field: 'playCount', value: 5 },
        { mediaIdentityId: id, providerId: plexId, field: 'playCount', value: 2 },
        { mediaIdentityId: id, providerId: plexId, field: 'studio', value: 'Legendary' },
      ])
    );
    const records = await readRefreshRecords(getDb());
    expect(records.map((r) => [r.providerId, r.kind, r.error])).toEqual(
      expect.arrayContaining([
        [tautulliId, 'facts', null],
        [plexId, 'facts', null],
      ])
    );
  });

  it("keeps a failing reporter's facts, records its failure and names it, and writes the others", async () => {
    const id = await title();
    const tautulli = fakeReporter(
      tautulliId,
      'Tautulli',
      'plexRatingKey',
      ['playCount'],
      () => new Map([['k', { playCount: 5 }]])
    );
    let studio = 'Legendary';
    const plex = fakeReporter(
      plexId,
      'Plex',
      'plexRatingKey',
      ['studio'],
      () => new Map([['k', { studio }]])
    );
    await job([tautulli, plex]).run();

    tautulli.provider.readReportedFacts.mockRejectedValue(new Error('Tautulli timed out'));
    studio = 'Warner';
    const second = job([tautulli, plex]);
    await second.run();

    expect(second.failedProviders()).toEqual(['Tautulli']);
    const facts = await queries.allFacts();
    expect(facts).toContainEqual({
      mediaIdentityId: id,
      providerId: tautulliId,
      field: 'playCount',
      value: 5,
    });
    expect(facts).toContainEqual({
      mediaIdentityId: id,
      providerId: plexId,
      field: 'studio',
      value: 'Warner',
    });
    const failed = (await readRefreshRecords(getDb())).find((r) => r.providerId === tautulliId);
    expect(failed?.error).toBe('Tautulli timed out');
  });

  it('removes the facts a reporter no longer reports for a title', async () => {
    const id = await title();
    let watched = true;
    const tautulli = fakeReporter(tautulliId, 'Tautulli', 'plexRatingKey', ['playCount'], () =>
      watched ? new Map([['k', { playCount: 1 }]]) : new Map()
    );
    await job([tautulli]).run();

    watched = false;
    await job([tautulli]).run();

    expect((await queries.allFacts()).filter((f) => f.mediaIdentityId === id)).toEqual([]);
  });

  it('asks every reporter about every title it can match, by its title id column, on every run', async () => {
    await title({ tmdbId: 100, plexRatingKey: null });
    await title({ tmdbId: 200, plexRatingKey: null });
    await title({ tmdbId: null, plexRatingKey: null, jellyfinItemId: 'jf-abc' });
    const tmdb = fakeReporter(tautulliId, 'TMDB', 'tmdbId', ['productionStatus'], () => new Map());
    const jellyfin = fakeReporter(
      plexId,
      'Jellyfin',
      'jellyfinItemId',
      ['studio'],
      () => new Map()
    );

    await job([tmdb, jellyfin]).run();
    await job([tmdb, jellyfin]).run();

    expect(tmdb.provider.readReportedFacts).toHaveBeenCalledTimes(2);
    expect(tmdb.provider.readReportedFacts.mock.calls[1][0]).toEqual([100, 200]);
    expect(jellyfin.provider.readReportedFacts.mock.calls[0][0]).toEqual(['jf-abc']);
  });

  it('stores only the facts a reporter declares, with defined values, matched by its title id column', async () => {
    const id = await title({ plexRatingKey: 'k' });
    await title({ plexRatingKey: 'other' });
    const plex = fakeReporter(
      plexId,
      'Plex',
      'plexRatingKey',
      ['playCount', 'lastWatchedAt'],
      () => new Map([['k', { playCount: 3, lastWatchedAt: undefined, studio: 'Undeclared' }]])
    );

    await job([plex]).run();

    expect(await queries.allFacts()).toEqual([
      { mediaIdentityId: id, providerId: plexId, field: 'playCount', value: 3 },
    ]);
  });

  it('gives every title an id names the answer for that id, as a movie and a series sharing a TMDB id', async () => {
    const movie = await title({ contentType: 'movie', tmdbId: 100, plexRatingKey: null });
    const series = await title({ contentType: 'series', tmdbId: 100, plexRatingKey: null });
    const tmdb = fakeReporter(
      tautulliId,
      'TMDB',
      'tmdbId',
      ['productionStatus'],
      () => new Map([[100, { productionStatus: 'Ended' }]])
    );

    await job([tmdb]).run();

    expect(tmdb.provider.readReportedFacts.mock.calls[0][0]).toEqual([100]);
    expect(await queries.allFacts()).toEqual(
      expect.arrayContaining([
        {
          mediaIdentityId: movie,
          providerId: tautulliId,
          field: 'productionStatus',
          value: 'Ended',
        },
        {
          mediaIdentityId: series,
          providerId: tautulliId,
          field: 'productionStatus',
          value: 'Ended',
        },
      ])
    );
  });

  it('records a reporter whose facts cannot be stored as a failed refresh, and still runs the next', async () => {
    const id = await title();
    const tautulli = fakeReporter(
      tautulliId,
      'Tautulli',
      'plexRatingKey',
      ['playCount'],
      () => new Map([['k', { playCount: 5 }]])
    );
    const plex = fakeReporter(
      plexId,
      'Plex',
      'plexRatingKey',
      ['studio'],
      () => new Map([['k', { studio: 'Legendary' }]])
    );
    const store = queries.replaceProviderFacts.bind(queries);
    vi.spyOn(queries, 'replaceProviderFacts').mockImplementation(async (providerId, facts) => {
      if (providerId === tautulliId) throw new Error('disk full');
      return store(providerId, facts);
    });

    const run = job([tautulli, plex]);
    await run.run();

    expect(run.failedProviders()).toEqual(['Tautulli']);
    expect(await queries.allFacts()).toEqual([
      { mediaIdentityId: id, providerId: plexId, field: 'studio', value: 'Legendary' },
    ]);
    const records = await readRefreshRecords(getDb());
    expect(records.find((r) => r.providerId === tautulliId)?.error).toBe('disk full');
  });
});
