import { MetadataProviderType, mediaIdentity, mediaItems } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { eq } from 'drizzle-orm';
import { itemKey, rawItemKey } from './mediaItem';
import type { MediaItem } from './mediaItem';
import { sourceCopyMatch } from './sourceCopies';

/**
 * The identity-graph column a non-source actuator addresses items by. Keyed by
 * addressing space, not provider: Tautulli has no id space of its own — it
 * reports entirely against Plex rating keys — so it shares Plex's column.
 */
const ADDRESS_COLUMN_BY_TYPE = {
  [MetadataProviderType.PLEX]: mediaIdentity.plexRatingKey,
  [MetadataProviderType.TAUTULLI]: mediaIdentity.plexRatingKey,
  [MetadataProviderType.JELLYFIN]: mediaIdentity.jellyfinItemId,
} as const;

type AddressedActuatorType = keyof typeof ADDRESS_COLUMN_BY_TYPE;

/**
 * Translates query-matched catalog items into a non-source actuator's own
 * addressing space: each item's `(providerId, externalId)` coordinate joins
 * through `media_item` to its `media_identity` group, whose Plex/Jellyfin
 * column carries the actuator-native id. Identities the resolution job has not
 * stamped yet drop out (no id to address), and multiple instance copies of one
 * identity collapse to a single id. `addressed` is the subset of `items` that
 * reached an actuator id — the items the task targets.
 */
export async function resolveActuatorTargets(
  db: DrizzleDb,
  actuatorType: MetadataProviderType,
  items: MediaItem[]
): Promise<{ actuatorIds: string[]; addressed: MediaItem[] }> {
  const column = ADDRESS_COLUMN_BY_TYPE[actuatorType as AddressedActuatorType];
  if (!column) {
    throw new Error(`Provider type "${actuatorType}" has no actuator addressing space`);
  }

  const match = sourceCopyMatch(items);
  if (!match) return { actuatorIds: [], addressed: [] };

  const rows = await db
    .select({
      actuatorId: column,
      providerId: mediaItems.providerId,
      externalId: mediaItems.externalId,
    })
    .from(mediaItems)
    .innerJoin(mediaIdentity, eq(mediaItems.mediaIdentityId, mediaIdentity.id))
    .where(match);

  const actuatorIdByItemKey = new Map<string, string>();
  for (const row of rows) {
    if (row.actuatorId !== null) {
      actuatorIdByItemKey.set(rawItemKey(row.providerId, row.externalId), row.actuatorId);
    }
  }
  return {
    actuatorIds: [...new Set(actuatorIdByItemKey.values())],
    addressed: items.filter((item) => actuatorIdByItemKey.has(itemKey(item) ?? '')),
  };
}
