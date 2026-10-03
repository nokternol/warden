import { mediaIdentity } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';

/**
 * Wipes every derived media row (`media_identity`, cascading to `media_item`
 * and `media_enrichment`) so it can be rebuilt from the source providers.
 * Live copies are a projection of Radarr/Sonarr/Plex/etc and rebuild fully.
 * Copies marked deleted (kept for run history) do not come back, and the
 * cascade removes runs' item links (`automation_run_items`); run rows and
 * their counts remain. Provider configuration is untouched.
 */
export async function resetMediaData(db: DrizzleDb): Promise<{ deletedIdentities: number }> {
  const deleted = await db.delete(mediaIdentity).returning({ id: mediaIdentity.id });
  return { deletedIdentities: deleted.length };
}
