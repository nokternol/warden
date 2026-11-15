import type { Cradle } from '@server/container';
import { enrichmentField, mediaEnrichment, metadataProviders } from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import type { EnrichmentFields } from '@server/modules/media';
import { and, eq } from 'drizzle-orm';

/**
 * Runs the catalog refresh as its system automation would, so the library copy holds what the
 * mocked providers answer, then tells the cache the copy changed.
 */
export async function refreshCatalog(
  cradle: Pick<Cradle, 'systemTaskRunner' | 'eventBus'>
): Promise<void> {
  await cradle.systemTaskRunner.run('system:identity-resolution');
  cradle.eventBus.emit('media:changed', {});
}

/**
 * Stores facts about one title as `providerId` reported them, as the enrichment job would, for
 * tests that need facts without running an enricher. Without `providerId` the facts are credited
 * to the first configured provider. Other titles' facts are left alone.
 */
export async function seedFacts(
  db: DrizzleDb,
  mediaIdentityId: number,
  facts: Partial<EnrichmentFields>,
  providerId?: number
): Promise<void> {
  const fields = new Map((await db.select().from(enrichmentField)).map((f) => [f.key, f.id]));
  const [firstProvider] = await db
    .select({ id: metadataProviders.id })
    .from(metadataProviders)
    .orderBy(metadataProviders.id)
    .limit(1);
  const credited = providerId ?? firstProvider.id;
  await db
    .delete(mediaEnrichment)
    .where(
      and(
        eq(mediaEnrichment.mediaIdentityId, mediaIdentityId),
        eq(mediaEnrichment.providerId, credited)
      )
    );
  const rows = Object.entries(facts)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({
      mediaIdentityId,
      providerId: credited,
      fieldId: fields.get(key)!,
      value: JSON.stringify(value),
    }));
  if (rows.length > 0) await db.insert(mediaEnrichment).values(rows);
}
