import type { ContentType } from '@contract/schemas';
import type { DrizzleDb } from '../../kernel/db';
import { type QueryResult, evaluateCombination } from './combinationEvaluator';
import type { EnrichmentQueries } from './enrichment/enrichment.queries';
import { mergeEnrichment } from './enrichmentMerge';
import type { FilterValueEntry } from './filterRegistry';
import { getRule } from './filterRegistry';
import type { MediaItemSet } from './mediaItem';
import { itemKey } from './mediaItem';
import type { MediaSource } from './mediaSource';
import type { NormalizedMovie } from './movie';
import type { NormalizedSeries } from './series';

/** One source within a query: a set of predicates and the role it plays. */
export interface MediaQuerySource {
  filterValues: FilterValueEntry[];
  role: 'include' | 'exclude';
}

/**
 * The persistable, source-less core of a query: the content type whose predicate
 * registry applies and one-or-more include/exclude sources. Both the evaluatable
 * `MediaQuery` and the persisted `MediaQueryRecord` are a `MediaQuerySpec` plus
 * what each adds (a bound source / a database identity).
 */
export interface MediaQuerySpec {
  contentType: ContentType;
  sources: MediaQuerySource[];
}

/**
 * A `MediaQuerySpec` bound to a `MediaSource` — the engine's input. The source is
 * what the engine reads items from; the spec says what to match. A query is
 * a single-source include spec; the browse view is the same with URL-derived
 * filterValues.
 */
export interface MediaQuery extends MediaQuerySpec {
  source: MediaSource;
}

export type { MediaItemSet };

/**
 * The engine's match primitive: the subset of `items` satisfying every predicate
 * in `filterValues` under the registry for `contentType`. Unknown keys pass through.
 * An entry qualified with `providerId` is a claim about one instance's namespace — an
 * item from another instance cannot satisfy it, so it fails the entry outright rather
 * than falling through to the predicate.
 */
export function matchItems<T extends NormalizedMovie | NormalizedSeries>(
  items: T[],
  filterValues: FilterValueEntry[],
  contentType: ContentType
): T[] {
  return items.filter((item) =>
    filterValues.every(({ key, value, providerId }) => {
      const rule = getRule(key, contentType);
      if (!rule) return true;
      if (providerId !== undefined && item._sourceIds.providerId !== providerId) return false;
      return rule.predicate(item, value);
    })
  );
}

/**
 * The single owner of "what does this query match". Fetches the bound provider's
 * items, applies the predicate registry per source, and combines include/exclude
 * across sources into the matched `MediaItemSet`.
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
    return this.combine(items, query.sources, query.contentType);
  }

  /**
   * Match every source, pool by `itemKey` (collision-free across instances — a batch
   * spanning two providers never collides on provider-native id alone), combine
   * include/exclude, return survivors.
   */
  private combine<T extends NormalizedMovie | NormalizedSeries>(
    normalized: T[],
    sources: MediaQuerySource[],
    contentType: ContentType
  ): T[] {
    const queryResults: QueryResult[] = sources.map((s) => ({
      role: s.role,
      items: matchItems(normalized, s.filterValues, contentType)
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
