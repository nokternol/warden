import { mediaIdentity, providerLists, providerRefresh } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';

/**
 * Deletes the library copy so it can be rebuilt from the providers: every title (cascading to its
 * copies, their payloads and its facts), every refresh record and every provider's stored lists,
 * in one batch. Copies marked removed do not come back. Runs keep their targeted titles, which
 * their item links hold themselves. Provider configuration is untouched.
 */
export async function resetMediaData(db: DrizzleDb): Promise<{ deletedIdentities: number }> {
  const [deleted] = await db.batch([
    db.delete(mediaIdentity).returning({ id: mediaIdentity.id }),
    db.delete(providerRefresh),
    db.delete(providerLists),
  ]);
  return { deletedIdentities: deleted.length };
}
