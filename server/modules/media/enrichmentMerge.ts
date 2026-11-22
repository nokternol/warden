import type { MetadataProviderType } from '../../database/schema';
import {
  REPORTED_FACT_PRECEDENCE,
  type ReportedFactKey,
  type ReportedFacts,
  providerKindOf,
} from '../providers';
import type { StoredFact } from './enrichment/enrichment.queries';

/**
 * Each title's facts, one value per fact (north-star belief 3), from the facts every reporter
 * stored. Where more than one provider reported a fact about a title, the value of the kind ranked
 * first in `REPORTED_FACT_PRECEDENCE` wins; between two providers of the same kind, the one
 * connected first (lowest provider id). The choice is per title, among the providers that reported
 * a value for it. Facts from a provider not in `typeOf` (an inactive one) are left out. Pure: the
 * library cache applies it when it loads.
 */
export function resolveFacts(
  facts: readonly StoredFact[],
  typeOf: ReadonlyMap<number, MetadataProviderType>
): Map<number, Partial<ReportedFacts>> {
  const kindRank = (field: ReportedFactKey, providerId: number): number => {
    const order = REPORTED_FACT_PRECEDENCE[field] ?? [];
    const kind = providerKindOf(typeOf.get(providerId)!);
    const position = kind ? order.indexOf(kind) : -1;
    return position === -1 ? order.length : position;
  };
  const outranks = (fact: StoredFact, current: StoredFact): boolean => {
    const byKind =
      kindRank(fact.field, fact.providerId) - kindRank(current.field, current.providerId);
    return byKind !== 0 ? byKind < 0 : fact.providerId < current.providerId;
  };
  const chosen = new Map<number, Map<ReportedFactKey, StoredFact>>();
  for (const fact of facts) {
    if (!typeOf.has(fact.providerId)) continue;
    const byField = chosen.get(fact.mediaIdentityId) ?? new Map();
    const current = byField.get(fact.field);
    if (!current || outranks(fact, current)) byField.set(fact.field, fact);
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
