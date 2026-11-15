import { and, eq, inArray } from 'drizzle-orm';
import { type MetadataProviderType, mediaItems, metadataProviders } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import type { EnrichableField } from './enrichment/enricher';
import type { EnrichmentQueries, StoredFact } from './enrichment/enrichment.queries';
import { contestedFieldPrecedence } from './enrichment/precedence';
import type { EnrichmentFields } from './mediaFieldProvider';
import { externalIdOf, itemKey } from './mediaItem';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

/**
 * Each title's facts, one value per fact, from the facts every provider reported. Where more than
 * one provider reported a fact, `contestedFieldPrecedence` picks the value of the provider type
 * ranked first; a fact one provider reported is kept as reported. Facts from a provider not in
 * `typeOf` (an inactive one) are left out. Pure: the library cache applies it when it loads.
 */
export function resolveFacts(
  facts: readonly StoredFact[],
  typeOf: ReadonlyMap<number, MetadataProviderType>
): Map<number, Partial<EnrichmentFields>> {
  const rank = (field: keyof EnrichmentFields, providerId: number): number => {
    const order: readonly MetadataProviderType[] =
      contestedFieldPrecedence[field as EnrichableField] ?? [];
    const position = order.indexOf(typeOf.get(providerId)!);
    return position === -1 ? order.length : position;
  };
  const chosen = new Map<number, Map<keyof EnrichmentFields, StoredFact>>();
  for (const fact of facts) {
    if (!typeOf.has(fact.providerId)) continue;
    const byField = chosen.get(fact.mediaIdentityId) ?? new Map();
    const current = byField.get(fact.field);
    if (!current || rank(fact.field, fact.providerId) < rank(fact.field, current.providerId)) {
      byField.set(fact.field, fact);
    }
    chosen.set(fact.mediaIdentityId, byField);
  }
  return new Map(
    [...chosen.entries()].map(([title, byField]) => [
      title,
      Object.fromEntries(
        [...byField.values()].map((f) => [f.field, f.value])
      ) as Partial<EnrichmentFields>,
    ])
  );
}

/**
 * Maps `media_enrichment` rows onto Normalized* items, joined through each item's
 * own `_sourceIds.providerId`/native id to its `media_item` copy and from there to
 * the owning group. The single source of truth for the identity→enrichment merge,
 * shared by the automation executor and the media browse handler. A batch may span
 * multiple instances (grouped by `providerId` per query); items without a matching
 * item/enrichment row are left untouched. Two items from two instances that resolve
 * to the same group correctly read the same group-level enrichment — that is the
 * model, not a bug: watched-ness is a fact about the title, not the copy.
 */
export async function mergeEnrichment<T extends NormalizedMovie | NormalizedSeries>(
  db: DrizzleDb,
  enrichmentQueries: EnrichmentQueries,
  items: T[]
): Promise<void> {
  const byProvider = new Map<number, T[]>();
  for (const item of items) {
    const providerId = item._sourceIds.providerId;
    const externalId = externalIdOf(item);
    if (providerId === undefined || externalId === undefined) continue;
    const bucket = byProvider.get(providerId);
    if (bucket) bucket.push(item);
    else byProvider.set(providerId, [item]);
  }
  if (byProvider.size === 0) return;

  const mediaItemRows = (
    await Promise.all(
      [...byProvider.entries()].map(([providerId, providerItems]) =>
        db
          .select()
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.providerId, providerId),
              inArray(
                mediaItems.externalId,
                providerItems.map((item) => externalIdOf(item)!)
              )
            )
          )
      )
    )
  ).flat();
  if (mediaItemRows.length === 0) return;

  const groupIdByItemKey = new Map(
    mediaItemRows.map((row) => [`${row.providerId}:${row.externalId}`, row.mediaIdentityId])
  );
  const providers = await db
    .select({ id: metadataProviders.id, type: metadataProviders.type })
    .from(metadataProviders)
    .where(eq(metadataProviders.isActive, true));
  const fieldsByGroupId = resolveFacts(
    await enrichmentQueries.allFacts(),
    new Map(providers.map((p) => [p.id, p.type as MetadataProviderType]))
  );

  for (const item of items) {
    const key = itemKey(item);
    if (key === undefined) continue;
    const groupId = groupIdByItemKey.get(key);
    if (groupId === undefined) continue;
    const fields = fieldsByGroupId.get(groupId);
    if (!fields) continue;
    // Storage only holds rows for resolved fields, so a generic assign is a
    // straight copy: an absent key leaves the item field untouched (undefined).
    Object.assign(item, fields);
  }
}
