import { type ContentType, isInstanceScopedValue } from '@contract/schemas';
import { ValidationError } from '../../kernel/errors';
import { type QueryResult, evaluateCombination } from './combinationEvaluator';
import type { LibraryCopy } from './libraryCache';
import type { MediaItemSet } from './mediaItem';
import { itemKey } from './mediaItem';
import type { MediaSource } from './mediaSource';
import type { NormalizedMovie } from './movie';
import type { Filter } from './ruleRegistry';
import { getRule } from './ruleRegistry';
import type { NormalizedSeries } from './series';

/** One clause of a query: a set of filters and the role it plays (an included or excluded query). */
export interface MediaQueryClause {
  filters: Filter[];
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
 * filters.
 */
export interface MediaQuery extends MediaQuerySpec {
  source: MediaSource;
}

export type { MediaItemSet };

/**
 * The conditions one evaluation answers: the filters of each included and each excluded query.
 * `contentType` picks the rule set, which an evaluation over no copies still needs.
 */
export interface Conditions {
  contentType: ContentType;
  include: Filter[][];
  exclude: Filter[][];
}

/** One title the conditions select, among the copies they were evaluated over. */
export interface SelectedTitle {
  mediaIdentityId: number;
  /** Every copy of the title among the given copies, in the given order. */
  copies: LibraryCopy[];
  /**
   * The copies that alone meet every filter of an included query the title meets; may be empty.
   * It only chooses which copy represents the title; it never decides selection or targets.
   */
  met: LibraryCopy[];
}

/**
 * The engine's match primitive: the subset of `items` satisfying every predicate
 * in `filters` under the registry for `contentType`. A key naming no rule throws: treating it as
 * matching everything widens an include, and matching nothing widens through an exclude.
 * A filter whose value names a `providerId` is a claim about one instance's namespace — an
 * item from another instance cannot satisfy it, so it fails the entry outright rather
 * than falling through to the predicate.
 */
export function matchItems<T extends NormalizedMovie | NormalizedSeries>(
  items: T[],
  filters: Filter[],
  contentType: ContentType
): T[] {
  return items.filter((item) =>
    filters.every(({ ruleKey, value }) => {
      const rule = getRule(ruleKey, contentType);
      if (!rule)
        throw new ValidationError(`This query uses a filter that no longer exists: ${ruleKey}`);
      if (isInstanceScopedValue(value) && value.providerId !== undefined) {
        if (item._sourceIds.providerId !== value.providerId) return false;
      }
      return rule.predicate(item, value);
    })
  );
}

/** The given copies grouped by title, each title keyed where its first copy appears. */
function titlesOf(copies: LibraryCopy[]): Map<number, LibraryCopy[]> {
  const titles = new Map<number, LibraryCopy[]>();
  for (const copy of copies) {
    const group = titles.get(copy.mediaIdentityId);
    if (group) group.push(copy);
    else titles.set(copy.mediaIdentityId, [copy]);
  }
  return titles;
}

/**
 * The single owner of "what does this query match". Fetches the bound provider's
 * items, applies the rule registry per clause, and combines include/exclude
 * across clauses into the matched `MediaItemSet`.
 */
export class MediaQueryEngine {
  /**
   * The titles `conditions` select among `copies`, in the order each title's first copy appears.
   * Owns no data and reads nothing else.
   */
  select(copies: LibraryCopy[], conditions: Conditions): SelectedTitle[] {
    const meets = (copy: LibraryCopy, filters: Filter[]) =>
      matchItems([copy.item], filters, conditions.contentType).length > 0;
    return [...titlesOf(copies)].flatMap(([mediaIdentityId, group]) => {
      const met = group.filter((copy) =>
        conditions.include.some((filters) => meets(copy, filters))
      );
      return met.length > 0 ? [{ mediaIdentityId, copies: group, met }] : [];
    });
  }

  /** Items come from the library copy carrying their facts, so evaluation reads nothing else. */
  async evaluate(query: MediaQuery): Promise<MediaItemSet> {
    const items = await query.source.getMediaItems();
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
      items: matchItems(normalized, c.filters, contentType)
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
