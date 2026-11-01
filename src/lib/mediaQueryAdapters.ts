import {
  type FilterState,
  type FilterValue,
  buildQuery,
  computeFieldIndex,
  scopeOf,
} from '@app/hooks/useMediaFilters';
import type { Filter } from '@app/hooks/useMediaQueries';
import { parseIds } from '@app/lib/multiValueFilter';
import type { MediaRuleDescriptor } from '@contract/media';
import { type ContentType, isInstanceScopedValue } from '@contract/schemas';

/**
 * The registry-keyed, scoped filter state (`useMediaFilters`) a content type's
 * filters are read from. Values may be absent (an empty title, a cleared control).
 */
export type ScopedFilterValues = Record<
  'shared' | ContentType,
  Record<string, FilterValue | undefined>
> & {
  movieQualifiers?: Record<string, number>;
  seriesQualifiers?: Record<string, number>;
};

/**
 * One content type's filter state as the `Filter` entries the API takes: both
 * browse and save send exactly these, so a saved query matches what was browsed.
 *
 * Scoping by content type (merging `shared` with just the one relevant scope,
 * rather than movie and series together) avoids the tagIds/qualityProfileIds/
 * genres collision the two scopes intentionally share one key for. An
 * instance-scoped rule's CSV ids become `{ ids }`, qualified by `providerId`
 * when the state names the instance.
 */
export function toFilters(
  filterState: ScopedFilterValues,
  contentType: ContentType,
  rules: MediaRuleDescriptor[]
): Filter[] {
  const scoped = contentType === 'movie' ? filterState.movie : filterState.series;
  const qualifiers =
    (contentType === 'movie' ? filterState.movieQualifiers : filterState.seriesQualifiers) ?? {};
  const merged: Record<string, FilterValue | undefined> = { ...filterState.shared, ...scoped };
  const instanceScoped = new Set(rules.filter((r) => r.instanceScoped).map((r) => r.key));
  return Object.entries(merged)
    .filter((entry): entry is [string, FilterValue] => entry[1] !== undefined)
    .map(([ruleKey, value]) => {
      if (!instanceScoped.has(ruleKey)) return { ruleKey, value };
      const providerId = qualifiers[ruleKey];
      const ids = parseIds(String(value));
      return { ruleKey, value: providerId === undefined ? { ids } : { providerId, ids } };
    });
}

/**
 * Whether Media can show exactly this query. A filter whose rule is no longer offered has no
 * control or URL param, so Media would show a wider set than the query selects.
 */
export function canOpenInMedia(
  query: { contentType: ContentType; filters: Filter[] },
  rules: MediaRuleDescriptor[]
): boolean {
  return query.filters.every(({ ruleKey }) =>
    rules.some((r) => r.key === ruleKey && r.contentTypes.includes(query.contentType))
  );
}

/**
 * The Media page URL showing a saved query: its filters as the params Media reads its filter state
 * from, on the query's own tab. The inverse of `toFilters`.
 */
export function mediaHref(
  query: { contentType: ContentType; filters: Filter[] },
  rules: MediaRuleDescriptor[]
): string {
  const state: FilterState = {
    shared: {},
    movie: {},
    series: {},
    movieQualifiers: {},
    seriesQualifiers: {},
    movieSort: 'title_asc',
    seriesSort: 'title_asc',
  };
  const qualifiers = query.contentType === 'movie' ? state.movieQualifiers : state.seriesQualifiers;
  for (const { ruleKey, value } of query.filters) {
    const rule = rules.find((r) => r.key === ruleKey && r.contentTypes.includes(query.contentType));
    if (!rule) continue;
    const bucket = state[scopeOf(rule)];
    if (typeof value === 'object' && isInstanceScopedValue(value)) {
      bucket[ruleKey] = value.ids.join(',');
      if (value.providerId !== undefined) qualifiers[ruleKey] = value.providerId;
    } else {
      bucket[ruleKey] = value as FilterValue;
    }
  }
  const params = new URLSearchParams(buildQuery(state, computeFieldIndex(rules)));
  if (query.contentType === 'series') params.set('tab', 'series');
  const search = params.toString();
  return search ? `/media?${search}` : '/media';
}
