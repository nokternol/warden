import type { ContentType } from '@contract/schemas';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

/** The canonical media model every provider role acts on — a movie or a series. */
export type MediaItem = NormalizedMovie | NormalizedSeries;

/** The transient result of resolving a source: its normalized items. */
export type MediaItemSet = MediaItem[];

/** Provider-native id of a source-produced item. */
export function externalIdOf(item: MediaItem): number | undefined {
  const ids = item._sourceIds as { radarr?: number; sonarr?: number };
  return ids.radarr ?? ids.sonarr;
}

/**
 * Collision-free key for pooled matching: `${providerId}:${externalId}`. An internal
 * map/set key only — never an id that leaves the process (task.run speaks `idOf`).
 */
export function rawItemKey(providerId: number, externalId: number): string {
  return `${providerId}:${externalId}`;
}

export function itemKey(item: MediaItem): string | undefined {
  const providerId = item._sourceIds.providerId;
  const externalId = externalIdOf(item);
  if (providerId === undefined || externalId === undefined) return undefined;
  return rawItemKey(providerId, externalId);
}

/**
 * Which title a copy belongs to: copies sharing a positive primary id (the TMDB id for a movie,
 * the TVDB id for a series) are one title, whatever instance holds them. A copy whose primary id
 * is missing or not positive is its own title, keyed by its instance and native id. Title strings
 * never decide a duplicate. Browse calls this with raw-row fields; the preview and run planning
 * call it with a normalised item's `_sourceIds`.
 */
export function titleKey(
  providerId: number,
  nativeId: number,
  primaryId: number | null | undefined
): string {
  return primaryId != null && primaryId > 0
    ? `primary:${primaryId}`
    : rawItemKey(providerId, nativeId);
}

/**
 * The title a source-produced item belongs to, by `titleKey` over its `_sourceIds`: the TMDB id
 * for a movie, the TVDB id for a series. Undefined for an item with no instance coordinate.
 */
export function titleKeyOf(item: MediaItem, contentType: ContentType): string | undefined {
  const ids = item._sourceIds as { providerId?: number; tmdb?: number; tvdb?: number };
  const nativeId = externalIdOf(item);
  if (ids.providerId === undefined || nativeId === undefined) return undefined;
  return titleKey(ids.providerId, nativeId, contentType === 'movie' ? ids.tmdb : ids.tvdb);
}

/**
 * Whether anything identifies which title a copy belongs to beyond the copy itself: false for a
 * copy whose primary id is missing or not positive, which `titleKey` makes its own title.
 */
export function identifiesTitle(item: MediaItem, contentType: ContentType): boolean {
  return titleKeyOf(item, contentType) !== itemKey(item);
}
