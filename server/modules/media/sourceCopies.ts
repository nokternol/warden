import { mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { type SQL, and, eq, inArray, or } from 'drizzle-orm';
import { externalIdOf } from './mediaItem';
import type { MediaItem } from './mediaItem';

/**
 * A `media_item` filter matching catalog items' source copies by each item's
 * `(providerId, externalId)` coordinate, one clause per provider. `null` when
 * no item carries a coordinate — callers must not run an unfiltered query.
 */
export function sourceCopyMatch(items: MediaItem[]): SQL | null {
  const byProvider = new Map<number, number[]>();
  for (const item of items) {
    const providerId = item._sourceIds.providerId;
    const externalId = externalIdOf(item);
    if (providerId === undefined || externalId === undefined) continue;
    const externalIds = byProvider.get(providerId) ?? [];
    externalIds.push(externalId);
    byProvider.set(providerId, externalIds);
  }
  if (byProvider.size === 0) return null;

  return or(
    ...[...byProvider.entries()].map(([providerId, externalIds]) =>
      and(eq(mediaItems.providerId, providerId), inArray(mediaItems.externalId, externalIds))
    )
  ) as SQL;
}

/**
 * The `media_item` ids of catalog items' source copies. Items with no
 * recorded copy are absent from the result.
 */
export async function sourceCopyIds(db: DrizzleDb, items: MediaItem[]): Promise<number[]> {
  const match = sourceCopyMatch(items);
  if (!match) return [];
  const rows = await db.select({ id: mediaItems.id }).from(mediaItems).where(match);
  return rows.map((row) => row.id);
}
