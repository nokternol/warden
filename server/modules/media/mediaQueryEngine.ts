import type { ContentType } from '@contract/schemas';
import type { DrizzleDb } from '../../kernel/db';
import { type QueryResult, evaluateCombination } from './combinationEvaluator';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import { mergeEnrichment } from './enrichmentMerge';
import type { MediaItemSet } from './mediaItem';
import { itemKey } from './mediaItem';
import type { MediaSource } from './mediaSource';
import type { NormalizedMovie } from './movie';
import type { Filter } from './ruleRegistry';
import { getRule, isInstanceScopedValue } from './ruleRegistry';
import type { NormalizedSeries } from './series';

/** One clause of a query: a set of filters and the role it plays (an included or excluded query). */
export interface MediaQueryClause {
  filterValues: Filter[];
  role: 'include' | 'exclude';
}

/**
 * The persistable, source-less core of a query: the content type whose rule
 * registry applies and one-or-more include/exclude clauses. Both the evaluatable
 * `MediaQuery` and the persisted `MediaQueryRecord` are a `MediaQuerySpec` plus
 * what each adds (a bound source / a database identity).
 */
export interface MediaQuerySpec {
  contentType: ContentType;
  clauses: MediaQueryClause[];
}

/**
 * A `MediaQuerySpec` bound to a `MediaSource` — the engine's input. The source is
 * what the engine reads items from; the spec says what to match. A query is
 * a single-clause include spec; the browse view is the same with URL-derived
 * filterValues.
 */
export interface MediaQuery extends MediaQuerySpec {
  source: MediaSource;
}

export type { MediaItemSet };

/**
 * The engine's match primitive: the subset of `items` satisfying every predicate
 * in `filterValues` under the registry for `contentType`. Unknown keys pass through.
 * A filter whose value names a `providerId` is a claim about one instance's namespace — an
 * item from another instance cannot satisfy it, so it fails the entry outright rather
 * than falling through to the predicate.
 */
export function matchItems<T extends NormalizedMovie | NormalizedSeries>(
  items: T[],
  filterValues: Filter[],
  contentType: ContentType
): T[] {
  return items.filter((item) =>
    filterValues.every(({ ruleKey, value }) => {
      const rule = getRule(ruleKey, contentType);
      if (!rule) return true;
      if (isInstanceScopedValue(value) && value.providerId !== undefined) {
        if (item._sourceIds.providerId !== value.providerId) return false;
      }
      return rule.predicate(item, value);
    })
  );
}

/**
 * The single owner of "what does this query match". Fetches the bound provider's
 * items, applies the rule registry per clause, and combines include/exclude
 * across clauses into the matched `MediaItemSet`.
 */
export class MediaQueryEngine {
  private readonly db?: DrizzleDb;
  private readonly enrichmentQueries?: EnrichmentQueries;

  constructor(deps: { db?: DrizzleDb; enrichmentQueries?: EnrichmentQueries } = {}) {
    this.db = deps.db;
    this.enrichmentQueries = deps.enrichmentQueries;
  }

  async evaluate(query: MediaQuery): Promise<MediaItemSet> {
    const { source } = query;
    const items = await source.getMediaItems();
    if (this.db && this.enrichmentQueries) {
      await mergeEnrichment(this.db, this.enrichmentQueries, items);
    }
    return this.combine(items, query.clauses, query.contentType);
  }

  /**
   * Match every clause, pool by `itemKey` (collision-free across instances — a batch
   * spanning two providers never collides on provider-native id alone), combine
   * include/exclude, return survivors.
   */
  private combine<T extends NormalizedMovie | NormalizedSeries>(
    normalized: T[],
    clauses: MediaQueryClause[],
    contentType: ContentType
  ): T[] {
    const queryResults: QueryResult[] = clauses.map((c) => ({
      role: c.role,
      items: matchItems(normalized, c.filterValues, contentType)
        .map((i) => itemKey(i))
        .filter((k): k is string => k !== undefined),
    }));
    const finalKeys = new Set(evaluateCombination(queryResults));
    return normalized.filter((i) => {
      const key = itemKey(i);
      return key !== undefined && finalKeys.has(key);
    });
  }
}
