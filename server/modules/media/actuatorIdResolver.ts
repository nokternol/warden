import type { MetadataProviderType } from '@server/database/schema';
import { ADDRESS_COLUMN_BY_TYPE } from '@server/modules/providers';
import type { LibraryCopy } from './libraryCache';

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
