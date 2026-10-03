import { eq } from 'drizzle-orm';
import { mediaIdentity } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import type { EnrichableField, MediaEnricher } from './enrichment/enricher';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import { contestedFieldPrecedence, resolvePrecedence } from './enrichment/precedence';
import type { EnrichmentFields } from './mediaFieldProvider';
import type { MediaItem } from './mediaItem';

/**
 * Every enrichable field's resolved-or-unknown value, keyed exactly like
 * `EnrichmentFields` minus `tags`. Assigning an object literal to this type makes a
 * missing or extra key a compile error — a new `EnrichmentFields` key breaks this
 * file until the write side is updated, instead of silently never persisting
 * (caught the hard way once already: `plexAddedAt` shipped to every other
 * touch point but not this one, and no test caught it because tests insert
 * enrichment rows directly, bypassing this write path).
 */
type EnrichmentWriteValues = { [K in EnrichableField]: EnrichmentFields[K] | null };

const STALENESS_SECONDS = 24 * 60 * 60;

interface Deps {
  db: DrizzleDb;
  enrichmentQueries: EnrichmentQueries;
  enrichers?: MediaEnricher[];
}

/**
 * A stable identity for a hydrated item — matches `resolvePrecedence`'s grouping key.
 * Collision-free by construction: `hydrate` always sets `_sourceIds.identity` to the
 * group's own surrogate id, so two kind-scoped groups that happen to share a numeric
 * `tmdbId` (a movie and a series with the same TMDB id) never hydrate to identical
 * keys and collide here.
 */
function identityKey(item: MediaItem): string {
  return JSON.stringify(item._sourceIds);
}

/**
 * Project a group row into the canonical item the enrichers match and decorate.
 * No `radarr`/`sonarr` key: the group carries no per-instance coordinate, and no
 * enricher ever matched on those keys (verified in `enricherAdapters.ts`).
 */
function hydrate(identity: typeof mediaIdentity.$inferSelect): MediaItem {
  const ids: Record<string, number | string> = { identity: identity.id };
  if (identity.tmdbId != null) ids.tmdb = identity.tmdbId;
  if (identity.plexRatingKey != null) ids.plex = identity.plexRatingKey;
  if (identity.imdbId != null) ids.imdb = identity.imdbId;
  if (identity.jellyfinItemId != null) ids.jellyfin = identity.jellyfinItemId;
  return { _sourceIds: ids, title: '' } as MediaItem;
}

export class EnrichmentJob {
  constructor(private deps: Deps) {}

  async run(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - STALENESS_SECONDS;

    const identities = await this.deps.db.select().from(mediaIdentity);
    const toEnrich = identities.filter((identity) => (identity.enrichedAt ?? 0) < staleThreshold);
    if (toEnrich.length === 0) return 0;

    // Hydrate each stale identity into a canonical item, tracking the row to write back to.
    const hydrated = toEnrich.map((identity) => ({
      identityId: identity.id,
      item: hydrate(identity),
    }));
    const items = hydrated.map((h) => h.item);

    // Every enricher decorates the same batch; precedence resolves per field at write time.
    const enrichers = this.deps.enrichers ?? [];
    const results = await Promise.all(enrichers.map((e) => e.enrich(items)));
    const resolvedByKey = new Map(
      resolvePrecedence(results, contestedFieldPrecedence).map((item) => [identityKey(item), item])
    );

    for (const { identityId, item } of hydrated) {
      const resolved = resolvedByKey.get(identityKey(item));
      const values: EnrichmentWriteValues = {
        playCount: resolved?.playCount ?? null,
        lastWatchedAt: resolved?.lastWatchedAt ?? null,
        overseerrRequestStatus: resolved?.overseerrRequestStatus ?? null,
        overseerrHasIssue: resolved?.overseerrHasIssue ?? null,
        tmdbStatus: resolved?.tmdbStatus ?? null,
        plexAddedAt: resolved?.plexAddedAt ?? null,
        studio: resolved?.studio ?? null,
        runtimeMinutes: resolved?.runtimeMinutes ?? null,
        fileSizeBytes: resolved?.fileSizeBytes ?? null,
        releaseDate: resolved?.releaseDate ?? null,
        fileContainer: resolved?.fileContainer ?? null,
        videoCodec: resolved?.videoCodec ?? null,
        audioCodec: resolved?.audioCodec ?? null,
        fileResolution: resolved?.fileResolution ?? null,
        labels: resolved?.labels ?? null,
        jellyfinAddedAt: resolved?.jellyfinAddedAt ?? null,
        isFavorite: resolved?.isFavorite ?? null,
      };
      const presentFields = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== null)
      ) as Partial<EnrichmentFields>;

      await this.deps.enrichmentQueries.replaceFields(identityId, presentFields);
      await this.deps.db
        .update(mediaIdentity)
        .set({ enrichedAt: now })
        .where(eq(mediaIdentity.id, identityId));
    }

    return toEnrich.length;
  }
}
