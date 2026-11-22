import type { MetadataProviderType } from '../../database/schema';
import type { ReportedFacts } from '../providers';
import type { EnrichableField } from './enrichment/enricher';
import type { StoredFact } from './enrichment/enrichment.queries';
import { contestedFieldPrecedence } from './enrichment/precedence';

/**
 * Each title's facts, one value per fact, from the facts every provider reported. Where more than
 * one provider reported a fact, `contestedFieldPrecedence` picks the value of the provider type
 * ranked first; a fact one provider reported is kept as reported. Facts from a provider not in
 * `typeOf` (an inactive one) are left out. Pure: the library cache applies it when it loads.
 */
export function resolveFacts(
  facts: readonly StoredFact[],
  typeOf: ReadonlyMap<number, MetadataProviderType>
): Map<number, Partial<ReportedFacts>> {
  const rank = (field: keyof ReportedFacts, providerId: number): number => {
    const order: readonly MetadataProviderType[] =
      contestedFieldPrecedence[field as EnrichableField] ?? [];
    const position = order.indexOf(typeOf.get(providerId)!);
    return position === -1 ? order.length : position;
  };
  const chosen = new Map<number, Map<keyof ReportedFacts, StoredFact>>();
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
      ) as Partial<ReportedFacts>,
    ])
  );
}
