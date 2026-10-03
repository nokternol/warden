import { MetadataProviderType, mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import type { MediaEnricher, MediaItem } from '@server/modules/media';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { EnrichmentJob } from '@server/modules/media/enrichmentJob';
import { eq } from 'drizzle-orm';
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

const NOW = Math.floor(Date.now() / 1000);
const FRESH = NOW - 3600; // 1h ago — within 24h window
const STALE = NOW - 86400 - 1; // just past 24h — needs re-enrichment

/** A MediaEnricher that decorates whatever items it is handed with fixed fields. */
function fakeEnricher(
  provider: MetadataProviderType,
  decorate: (item: MediaItem) => Partial<MediaItem> | undefined
): MediaEnricher {
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

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    queries = new EnrichmentQueries({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('skips identity rows enriched within 24h — no enricher is queried', async () => {
    const db = getDb();
    await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 100, plexRatingKey: 'fresh', enrichedAt: FRESH });

    const enricher = fakeEnricher(MetadataProviderType.PLEX, () => undefined);
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [enricher] }).run();

    expect(enricher.enrich).not.toHaveBeenCalled();
  });

  it('persists the resolved canonical play count for a stale identity', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 100, plexRatingKey: 'abc123', enrichedAt: STALE })
      .returning();

    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, (item) =>
      item._sourceIds.plex === 'abc123' ? { playCount: 2 } : undefined
    );
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [tautulli] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.playCount).toBe(2);
    const [updated] = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.id, identity.id));
    expect(updated.enrichedAt).toBeGreaterThan(STALE);
  });

  it('resolves a field per precedence across enrichers (Tautulli over Plex for playCount)', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 100, plexRatingKey: 'k', enrichedAt: STALE })
      .returning();

    const plex = fakeEnricher(MetadataProviderType.PLEX, () => ({ playCount: 2 }));
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => ({ playCount: 5 }));
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [plex, tautulli] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.playCount).toBe(5);
  });

  it('persists an ISO last-watched value resolved from an enricher', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', plexRatingKey: 'k', enrichedAt: STALE })
      .returning();

    const iso = new Date(1_700_000_000 * 1000).toISOString();
    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => ({ lastWatchedAt: iso }));
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [tautulli] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.lastWatchedAt).toBe(iso);
  });

  it('persists a resolved Plex-added ISO value', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', plexRatingKey: 'k', enrichedAt: STALE })
      .returning();

    const iso = new Date(1_700_000_000 * 1000).toISOString();
    const plex = fakeEnricher(MetadataProviderType.PLEX, () => ({ plexAddedAt: iso }));
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [plex] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.plexAddedAt).toBe(iso);
  });

  it('persists a resolved studio value', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', plexRatingKey: 'k', enrichedAt: STALE })
      .returning();

    const plex = fakeEnricher(MetadataProviderType.PLEX, () => ({ studio: 'Legendary Pictures' }));
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [plex] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.studio).toBe('Legendary Pictures');
  });

  it('hydrates _sourceIds.jellyfin from the identity row for a Jellyfin-known item', async () => {
    const db = getDb();
    await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', jellyfinItemId: 'jf-abc', enrichedAt: STALE });

    let seenJellyfinId: string | number | undefined;
    const jellyfin = fakeEnricher(MetadataProviderType.JELLYFIN, (item) => {
      seenJellyfinId = item._sourceIds.jellyfin;
      return undefined;
    });
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [jellyfin] }).run();

    expect(seenJellyfinId).toBe('jf-abc');
  });

  it('leaves no row for a field no enricher touched', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', tmdbId: 100, enrichedAt: STALE })
      .returning();

    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => undefined);
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [tautulli] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.playCount).toBeUndefined();
    const [updated] = await db
      .select()
      .from(mediaIdentity)
      .where(eq(mediaIdentity.id, identity.id));
    expect(updated.enrichedAt).toBeGreaterThan(STALE);
  });

  it('enriches an identity that has never been enriched before (enrichedAt null)', async () => {
    const db = getDb();
    const [identity] = await db
      .insert(mediaIdentity)
      .values({ kind: 'movie', plexRatingKey: 'k' })
      .returning();

    const tautulli = fakeEnricher(MetadataProviderType.TAUTULLI, () => ({ playCount: 7 }));
    await new EnrichmentJob({ db, enrichmentQueries: queries, enrichers: [tautulli] }).run();

    const fields = await queries.getByIdentityIds([identity.id]);
    expect(fields.get(identity.id)?.playCount).toBe(7);
  });

  it('returns the number of identity rows it enriched', async () => {
    const db = getDb();
    await db.insert(mediaIdentity).values([
      { kind: 'movie', tmdbId: 100, enrichedAt: STALE },
      { kind: 'movie', tmdbId: 200, enrichedAt: STALE },
    ]);

    const job = new EnrichmentJob({
      db,
      enrichmentQueries: queries,
      enrichers: [fakeEnricher(MetadataProviderType.TAUTULLI, () => undefined)],
    });

    expect(await job.run()).toBe(2);
  });
});
