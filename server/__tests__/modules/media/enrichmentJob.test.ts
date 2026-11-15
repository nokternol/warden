import { MetadataProviderType, mediaIdentity, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import type { MediaEnricher, MediaItem } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { EnrichmentJob } from '@server/modules/media/enrichmentJob';
import { readRefreshRecords } from '@server/modules/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig = {
  NODE_ENV: 'test',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  LOG_LEVEL: 'error',
} as AppConfig;

/** A MediaEnricher that decorates whatever items it is handed with the fields `decorate` gives. */
function fakeEnricher(
  provider: MetadataProviderType,
  decorate: (item: MediaItem) => Partial<MediaItem> | undefined
): MediaEnricher & { enrich: ReturnType<typeof vi.fn> } {
  return {
    enrich: vi.fn(async (items: MediaItem[]) => ({
      provider,
      items: items
        .map((item) => {
          const fields = decorate(item);
          return fields ? ({ ...item, ...fields } as MediaItem) : undefined;
        })
        .filter((i): i is MediaItem => i !== undefined),
    })),
  };
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

  function job(enrichers: Array<{ providerId: number; name: string; enricher: MediaEnricher }>) {
    return new EnrichmentJob({ db: getDb(), enrichmentQueries: queries, enrichers });
  }

  it("stores each enricher's facts under its own provider and records the refresh", async () => {
    const id = await title();
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => ({ playCount: 5 }));
    const plex = fakeEnricher(MetadataProviderType.PLEX, () => ({
      playCount: 2,
      studio: 'Legendary',
    }));

    await job([
      { providerId: tautulliId, name: 'Tautulli', enricher: tautulli },
      { providerId: plexId, name: 'Plex', enricher: plex },
    ]).run();

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

  it("keeps a failing enricher's facts, records its failure and names it, and writes the others", async () => {
    const id = await title();
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => ({ playCount: 5 }));
    const plex = fakeEnricher(MetadataProviderType.PLEX, () => ({ studio: 'Legendary' }));
    const enrichers = [
      { providerId: tautulliId, name: 'Tautulli', enricher: tautulli },
      { providerId: plexId, name: 'Plex', enricher: plex },
    ];
    await job(enrichers).run();

    tautulli.enrich.mockRejectedValue(new Error('Tautulli timed out'));
    plex.enrich.mockImplementation(async (items: MediaItem[]) => ({
      provider: MetadataProviderType.PLEX,
      items: items.map((item) => ({ ...item, studio: 'Warner' })),
    }));
    const second = job(enrichers);
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

  it('removes the facts a provider no longer reports for a title', async () => {
    const id = await title();
    let watched = true;
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () =>
      watched ? { playCount: 1 } : undefined
    );
    const enrichers = [{ providerId: tautulliId, name: 'Tautulli', enricher: tautulli }];
    await job(enrichers).run();

    watched = false;
    await job(enrichers).run();

    expect((await queries.allFacts()).filter((f) => f.mediaIdentityId === id)).toEqual([]);
  });

  it('reads every enricher for every title on every run', async () => {
    await title({ tmdbId: 100 });
    await title({ tmdbId: 200 });
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => undefined);
    const enrichers = [{ providerId: tautulliId, name: 'Tautulli', enricher: tautulli }];

    await job(enrichers).run();
    await job(enrichers).run();

    expect(tautulli.enrich).toHaveBeenCalledTimes(2);
    expect(tautulli.enrich.mock.calls[1][0]).toHaveLength(2);
  });

  it('hydrates _sourceIds.jellyfin from the title for a Jellyfin-known item', async () => {
    await title({ plexRatingKey: null, jellyfinItemId: 'jf-abc' });
    let seen: string | number | undefined;
    const jellyfin = fakeEnricher(MetadataProviderType.JELLYFIN, (item) => {
      seen = item._sourceIds.jellyfin;
      return undefined;
    });

    await job([{ providerId: plexId, name: 'Jellyfin', enricher: jellyfin }]).run();

    expect(seen).toBe('jf-abc');
  });
});
