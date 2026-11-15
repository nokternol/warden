import { MetadataProviderType } from '@server/database/schema';
import type { LibraryCopy } from './libraryCache';

/** A title's media-server id columns, as the catalog refresh links them. */
export type AddressColumn = 'plexRatingKey' | 'jellyfinItemId';

/**
 * The title id a non-source actuator addresses items by. Keyed by addressing space, not
 * provider: Tautulli has no id space of its own (it reports entirely against Plex rating keys),
 * so it shares Plex's column.
 */
export const ADDRESS_COLUMN_BY_TYPE: Partial<Record<MetadataProviderType, AddressColumn>> = {
  [MetadataProviderType.PLEX]: 'plexRatingKey',
  [MetadataProviderType.TAUTULLI]: 'plexRatingKey',
  [MetadataProviderType.JELLYFIN]: 'jellyfinItemId',
};

/** The media server whose `links` refresh writes each address column. */
export const MEDIA_SERVER_BY_COLUMN: Record<AddressColumn, MetadataProviderType> = {
  plexRatingKey: MetadataProviderType.PLEX,
  jellyfinItemId: MetadataProviderType.JELLYFIN,
};

/** Whether `type` acts on titles by a media server's id rather than a source's own catalog. */
export function isAddressedActuator(type: MetadataProviderType): boolean {
  return ADDRESS_COLUMN_BY_TYPE[type] !== undefined;
}

/**
 * A copy's title in a non-source actuator's own addressing space, from the ids the catalog
 * refresh linked; undefined while the title is not linked to that server.
 */
export function actuatorIdOf(
  copy: LibraryCopy,
  actuatorType: MetadataProviderType
): string | undefined {
  const column = ADDRESS_COLUMN_BY_TYPE[actuatorType];
  if (!column) {
    throw new Error(`Provider type "${actuatorType}" has no actuator addressing space`);
  }
  return copy.links[column] ?? undefined;
}
