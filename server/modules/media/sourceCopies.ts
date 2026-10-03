import type { ContentType } from '@contract/schemas';
import { mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { type SQL, and, eq, inArray, or } from 'drizzle-orm';
import { type GroupIds, resolveGroup } from '../providers';
import { externalIdOf, rawItemKey } from './mediaItem';
import type { MediaItem } from './mediaItem';

/** A catalog item's source-copy coordinate: the instance and its native id. */
interface Coordinate {
  providerId: number;
  externalId: number;
}

function coordinateOf(item: MediaItem): Coordinate | undefined {
  const providerId = item._sourceIds.providerId;
  const externalId = externalIdOf(item);
  if (providerId === undefined || externalId === undefined) return undefined;
  return { providerId, externalId };
}

/**
 * A `media_item` filter matching catalog items' source copies by each item's
 * `(providerId, externalId)` coordinate, one clause per provider. `null` when
 * no item carries a coordinate — callers must not run an unfiltered query.
 */
export function sourceCopyMatch(items: MediaItem[]): SQL | null {
  const byProvider = new Map<number, number[]>();
  for (const item of items) {
    const coordinate = coordinateOf(item);
    if (!coordinate) continue;
    const externalIds = byProvider.get(coordinate.providerId) ?? [];
    externalIds.push(coordinate.externalId);
    byProvider.set(coordinate.providerId, externalIds);
  }
  if (byProvider.size === 0) return null;

  return or(
    ...[...byProvider.entries()].map(([providerId, externalIds]) =>
      and(eq(mediaItems.providerId, providerId), inArray(mediaItems.externalId, externalIds))
    )
  ) as SQL;
}

/**
 * The `media_item` ids of catalog items' source copies, creating any copy the
 * identity job has not recorded yet (an item added to its source since the
 * last resolution) through the same find-or-create group resolution the job
 * uses. It writes `media_identity`/`media_item` rows.
 */
export async function ensureSourceCopies(db: DrizzleDb, items: MediaItem[]): Promise<number[]> {
  const match = sourceCopyMatch(items);
  if (!match) return [];
  const recorded = await db
    .select({
      id: mediaItems.id,
      providerId: mediaItems.providerId,
      externalId: mediaItems.externalId,
    })
    .from(mediaItems)
    .where(match);
  const recordedKeys = new Set(recorded.map((row) => rawItemKey(row.providerId, row.externalId)));

  const ids = recorded.map((row) => row.id);
  for (const item of items) {
    const coordinate = coordinateOf(item);
    if (!coordinate) continue;
    if (recordedKeys.has(rawItemKey(coordinate.providerId, coordinate.externalId))) continue;
    const mediaIdentityId = await resolveGroup(db, contentTypeOf(item), groupIdsOf(item));
    const [created] = await db
      .insert(mediaItems)
      .values({ ...coordinate, mediaIdentityId })
      .returning({ id: mediaItems.id });
    ids.push(created.id);
  }
  return ids;
}

type SourceIds = MediaItem['_sourceIds'] & {
  radarr?: number;
  tvdb?: number;
  tvmaze?: number;
};

function contentTypeOf(item: MediaItem): ContentType {
  return (item._sourceIds as SourceIds).radarr !== undefined ? 'movie' : 'series';
}

function groupIdsOf(item: MediaItem): GroupIds {
  const ids = item._sourceIds as SourceIds;
  return {
    tmdbId: ids.tmdb,
    tvdbId: ids.tvdb,
    imdbId: ids.imdb,
    tvMazeId: ids.tvmaze,
    title: item.title,
    year: item.year,
  };
}
