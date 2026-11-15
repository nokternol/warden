import { providerLists } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { eq } from 'drizzle-orm';

/** One provider's setup lists, as last refreshed. A part never read successfully is absent. */
export interface ProviderListsData {
  tags?: Array<{ id: number; label: string }>;
  qualityProfiles?: Array<{ id: number; name: string }>;
  rootFolders?: Array<{ id: number; path: string }>;
  languageProfiles?: Array<{ id: number; name: string }>;
}

/** Every provider's stored lists, by provider id. */
export async function readProviderLists(db: DrizzleDb): Promise<Map<number, ProviderListsData>> {
  const rows = await db.select().from(providerLists);
  return new Map(rows.map((row) => [row.providerId, JSON.parse(row.data) as ProviderListsData]));
}

/**
 * Stores the parts of one provider's lists that were read; a part left out keeps its last
 * successful value.
 */
export async function storeProviderLists(
  db: DrizzleDb,
  providerId: number,
  parts: ProviderListsData
): Promise<void> {
  const [stored] = await db
    .select({ data: providerLists.data })
    .from(providerLists)
    .where(eq(providerLists.providerId, providerId));
  const data = JSON.stringify({ ...(stored ? JSON.parse(stored.data) : {}), ...parts });
  await db
    .insert(providerLists)
    .values({ providerId, data })
    .onConflictDoUpdate({ target: providerLists.providerId, set: { data } });
}
