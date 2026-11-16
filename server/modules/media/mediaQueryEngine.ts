import { type ContentType, isInstanceScopedValue } from '@contract/schemas';
import { ValidationError } from '../../kernel/errors';
import type { LibraryCopy } from './libraryCache';
import type { Filter } from './ruleRegistry';
import { getRule } from './ruleRegistry';

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

/** Whether one copy, on its own, meets one filter. */
type CopyTest = (copy: LibraryCopy) => boolean;

/**
 * A filter as a test of one copy, its rule looked up once. A key naming no rule throws: treating
 * it as met widens an include, and treating it as unmet widens through an exclude. A value naming
 * a `providerId` is a claim about that instance's id space, so only that instance's copy can
 * meet it.
 */
function testOf({ ruleKey, value }: Filter, contentType: ContentType): CopyTest {
  const rule = getRule(ruleKey, contentType);
  if (!rule)
    throw new ValidationError(`This query uses a filter that no longer exists: ${ruleKey}`);
  const instance = isInstanceScopedValue(value) ? value.providerId : undefined;
  return (copy) =>
    (instance === undefined || copy.item._sourceIds.providerId === instance) &&
    rule.predicate(copy.item, value);
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
 * The one evaluation of the catalog: which titles a set of conditions selects among the copies
 * it is given. The Media page, query counts and automation planning all read its answer, so no
 * other part of Warden decides whether a title meets conditions.
 */
export class MediaQueryEngine {
  /**
   * The titles `conditions` select among `copies`, in the order each title's first copy appears.
   * Owns no data and reads nothing else. Every rule is looked up before any copy is read.
   */
  select(copies: LibraryCopy[], conditions: Conditions): SelectedTitle[] {
    const resolve = (filters: Filter[]) => filters.map((f) => testOf(f, conditions.contentType));
    const include = conditions.include.map(resolve);
    const exclude = conditions.exclude.map(resolve);
    return [...titlesOf(copies)].flatMap(([mediaIdentityId, group]) => {
      const titleMeets = (query: CopyTest[]) =>
        query.every((test) => group.some((copy) => test(copy)));
      const metQueries = include.filter(titleMeets);
      if (metQueries.length === 0 || exclude.some(titleMeets)) return [];
      const met = group.filter((copy) => metQueries.some((query) => query.every((t) => t(copy))));
      return [{ mediaIdentityId, copies: group, met }];
    });
  }
}
