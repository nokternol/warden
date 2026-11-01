import { mediaIdentity } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';

/**
 * Wipes every derived media row (`media_identity`, cascading to `media_item`
 * and `media_enrichment`) so it can be rebuilt from the source providers.
 * Live copies are a projection of Radarr/Sonarr/Plex/etc and rebuild fully.
 * Copies marked deleted do not come back. Runs keep their targeted titles, which their item links
 * hold themselves. Provider configuration is untouched.
 */
export async function resetMediaData(db: DrizzleDb): Promise<{ deletedIdentities: number }> {
  const deleted = await db.delete(mediaIdentity).returning({ id: mediaIdentity.id });
  return { deletedIdentities: deleted.length };
}
