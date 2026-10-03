import { mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { and, eq, inArray, or } from 'drizzle-orm';
import { externalIdOf } from './mediaItem';
import type { MediaItem } from './mediaItem';

/**
 * The `media_item` ids of catalog items' source copies, found by each item's
 * `(providerId, externalId)` coordinate. Items with no recorded copy are
 * absent from the result.
 */
export async function sourceCopyIds(db: DrizzleDb, items: MediaItem[]): Promise<number[]> {
  const byProvider = new Map<number, number[]>();
  for (const item of items) {
    const providerId = item._sourceIds.providerId;
    const externalId = externalIdOf(item);
    if (providerId === undefined || externalId === undefined) continue;
    const externalIds = byProvider.get(providerId) ?? [];
    externalIds.push(externalId);
    byProvider.set(providerId, externalIds);
  }
  if (byProvider.size === 0) return [];

  const rows = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      or(
        ...[...byProvider.entries()].map(([providerId, externalIds]) =>
          and(eq(mediaItems.providerId, providerId), inArray(mediaItems.externalId, externalIds))
        )
      )
    );
  return rows.map((row) => row.id);
}
