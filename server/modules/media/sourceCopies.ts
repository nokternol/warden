import type { ContentType } from '@contract/schemas';
import { mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { type SQL, and, eq, inArray, or } from 'drizzle-orm';
import { type SourceCopy, recordSourceCopy } from '../providers';
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
 * The `media_item` ids of catalog items' source copies. A copy the identity
 * job has not recorded yet (an item added to its source since the last
 * resolution) is recorded through the providers module, which owns the
 * identity graph's writes. Every item is of `contentType`, which scopes the
 * group its copy joins.
 */
export async function ensureSourceCopies(
  db: DrizzleDb,
  contentType: ContentType,
  items: MediaItem[]
): Promise<number[]> {
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
    const key = rawItemKey(coordinate.providerId, coordinate.externalId);
    if (recordedKeys.has(key)) continue;
    recordedKeys.add(key);
    ids.push(
      await recordSourceCopy(db, {
        kind: contentType,
        ...coordinate,
        ids: groupIdsOf(item),
      })
    );
  }
  return ids;
}

function groupIdsOf(item: MediaItem): SourceCopy['ids'] {
  const ids = item._sourceIds;
  return {
    tmdbId: ids.tmdb,
    tvdbId: 'tvdb' in ids ? ids.tvdb : undefined,
    imdbId: ids.imdb,
    tvMazeId: 'tvmaze' in ids ? ids.tvmaze : undefined,
    title: item.title,
    year: item.year,
  };
}
