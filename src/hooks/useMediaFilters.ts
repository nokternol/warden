import type { MediaFilters } from '@app/types/media';
import type { ContentType } from '@contract/schemas';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaRuleDescriptor } from './useMediaRules';
import { useMediaRules } from './useMediaRules';

const DEBOUNCE_MS = 300;

export type RangeValue = { min?: number; max?: number };
export type FilterValue = string | number | boolean | RangeValue;
export type ContentScope = 'shared' | ContentType;

export interface FilterState {
  shared: Record<string, FilterValue>;
  movie: Record<string, FilterValue>;
  series: Record<string, FilterValue>;
  /** Instance qualification for movie/series-scoped `instanceScoped` rule values (`tagIds`,
   *  `qualityProfileIds`) — ruleKey -> providerId. Absent key means unqualified, exactly
   *  today's semantics. Never populated for `shared` rules, which are never instance-scoped. */
  movieQualifiers: Record<string, number>;
  seriesQualifiers: Record<string, number>;
  movieSort: string;
  seriesSort: string;
}

export type QualifierScope = ContentType;

const SORT_DEFAULT = 'title_asc';

const EMPTY_FILTER_STATE: FilterState = {
  shared: { title: '' },
  movie: {},
  series: {},
  movieQualifiers: {},
  seriesQualifiers: {},
  movieSort: SORT_DEFAULT,
  seriesSort: SORT_DEFAULT,
};

export function scopeOf(rule: MediaRuleDescriptor): ContentScope {
  if (rule.contentTypes.length === 2) return 'shared';
  return rule.contentTypes[0] === 'movie' ? 'movie' : 'series';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ParamMeta {
  scope: ContentScope;
  key: string;
  bound?: 'min' | 'max';
}

/**
 * Derives URL param names from (scope, key) — prefixing with the scope only
 * for the rule keys the registry intentionally reuses across movie/series
 * (`tagIds`, `qualityProfileIds`, `genres`), so both can hold independent
 * values in one URL without collision. No hand-maintained name table: the
 * prefix is a mechanical function of whether the key collides.
 */
export interface FieldIndex {
  paramNameFor: (scope: ContentScope, key: string) => string;
  dataTypeFor: (scope: ContentScope, key: string) => MediaRuleDescriptor['dataType'] | undefined;
  reverse: Map<string, ParamMeta>;
}

export function computeFieldIndex(rules: MediaRuleDescriptor[]): FieldIndex {
  const scopesByKey = new Map<string, Set<ContentScope>>();
  for (const r of rules) {
    const scope = scopeOf(r);
    if (!scopesByKey.has(r.key)) scopesByKey.set(r.key, new Set());
    scopesByKey.get(r.key)!.add(scope);
  }

  const paramNames = new Map<string, string>(); // `${scope}:${key}` -> paramBase
  const dataTypes = new Map<string, MediaRuleDescriptor['dataType']>();
  const reverse = new Map<string, ParamMeta>();

  for (const r of rules) {
    const scope = scopeOf(r);
    const collides = (scopesByKey.get(r.key)?.size ?? 0) > 1;
    const paramBase = collides ? `${scope}${capitalize(r.key)}` : r.key;
    paramNames.set(`${scope}:${r.key}`, paramBase);
    dataTypes.set(`${scope}:${r.key}`, r.dataType);

    if (r.dataType === 'range') {
      reverse.set(`${paramBase}Min`, { scope, key: r.key, bound: 'min' });
      reverse.set(`${paramBase}Max`, { scope, key: r.key, bound: 'max' });
    } else {
      reverse.set(paramBase, { scope, key: r.key });
    }
  }

  return {
    paramNameFor: (scope, key) => paramNames.get(`${scope}:${key}`) ?? key,
    dataTypeFor: (scope, key) => dataTypes.get(`${scope}:${key}`),
    reverse,
  };
}

const QUALIFIER_SUFFIX = 'ProviderId';

function parseQuery(
  query: Record<string, string | string[] | undefined>,
  index: FieldIndex | undefined
): FilterState {
  const state: FilterState = {
    shared: { title: '' },
    movie: {},
    series: {},
    movieQualifiers: {},
    seriesQualifiers: {},
    movieSort: SORT_DEFAULT,
    seriesSort: SORT_DEFAULT,
  };

  for (const [param, raw] of Object.entries(query)) {
    if (typeof raw !== 'string') continue;
    if (param === 'movieSort' || param === 'seriesSort') {
      state[param] = raw;
      continue;
    }
    if (param.endsWith(QUALIFIER_SUFFIX)) {
      const meta = index?.reverse.get(param.slice(0, -QUALIFIER_SUFFIX.length));
      if (!meta || meta.scope === 'shared') continue;
      const n = Number(raw);
      if (Number.isNaN(n)) continue;
      state[meta.scope === 'movie' ? 'movieQualifiers' : 'seriesQualifiers'][meta.key] = n;
      continue;
    }
    const meta = index?.reverse.get(param);
    if (!meta) continue;
    const bucket = state[meta.scope];
    if (meta.bound) {
      const n = Number(raw);
      if (Number.isNaN(n)) continue;
      const existing = (bucket[meta.key] as RangeValue | undefined) ?? {};
      bucket[meta.key] = { ...existing, [meta.bound]: n };
    } else if (index?.dataTypeFor(meta.scope, meta.key) === 'number') {
      const n = Number(raw);
      if (!Number.isNaN(n)) bucket[meta.key] = n;
    } else {
      bucket[meta.key] = raw;
    }
  }

  return state;
}

function buildQuery(state: FilterState, index: FieldIndex | undefined): Record<string, string> {
  const q: Record<string, string> = {};
  if (state.movieSort !== SORT_DEFAULT) q.movieSort = state.movieSort;
  if (state.seriesSort !== SORT_DEFAULT) q.seriesSort = state.seriesSort;

  for (const scope of ['shared', 'movie', 'series'] as const) {
    for (const [key, value] of Object.entries(state[scope])) {
      if (value === undefined) continue;
      if (scope === 'shared' && key === 'title' && value === '') continue;
      const paramBase = index?.paramNameFor(scope, key) ?? key;
      if (typeof value === 'object') {
        if (value.min !== undefined) q[`${paramBase}Min`] = String(value.min);
        if (value.max !== undefined) q[`${paramBase}Max`] = String(value.max);
      } else {
        q[paramBase] = String(value);
      }
    }
  }

  for (const scope of ['movie', 'series'] as const) {
    const qualifiers = state[scope === 'movie' ? 'movieQualifiers' : 'seriesQualifiers'];
    for (const [key, providerId] of Object.entries(qualifiers)) {
      const paramBase = index?.paramNameFor(scope, key) ?? key;
      q[`${paramBase}${QUALIFIER_SUFFIX}`] = String(providerId);
    }
  }

  return q;
}

function isBucketActive(bucket: Record<string, FilterValue>, skipEmptyTitle = false): boolean {
  return Object.entries(bucket).some(([key, value]) => {
    if (skipEmptyTitle && key === 'title') return value !== '';
    if (value === undefined) return false;
    if (typeof value === 'object') return value.min !== undefined || value.max !== undefined;
    return true;
  });
}

function isAnyFilterActive(state: FilterState): boolean {
  return (
    isBucketActive(state.shared, true) ||
    isBucketActive(state.movie) ||
    isBucketActive(state.series)
  );
}

export function useMediaFilters() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { rules, isLoading: rulesLoading } = useMediaRules();
  const index = useMemo(() => (rules ? computeFieldIndex(rules) : undefined), [rules]);

  const [filterState, setFilterState] = useState<FilterState>(() =>
    parseQuery(router.query, index)
  );

  // Rules load asynchronously; numeric/range URL params parse as raw strings
  // until they do. Once loaded, re-parse the URL once to correct the shape —
  // a one-time catch-up rather than a permanent client-side dataType table.
  const rulesAppliedRef = useRef(false);
  useEffect(() => {
    if (!index || rulesAppliedRef.current) return;
    rulesAppliedRef.current = true;
    setFilterState(parseQuery(routerRef.current.query, index));
  }, [index]);

  const [debouncedTitle, setDebouncedTitle] = useState(filterState.shared.title as string);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTitle(filterState.shared.title as string);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filterState.shared.title]);

  // Skip the mount run (as before), then compare each subsequent query against
  // the last one *we* computed (not `router.query` itself — shallow-routed
  // replaces don't reliably reflect back synchronously in every environment),
  // so the rules-loaded catch-up re-parse above doesn't fire a spurious
  // replace when it reproduces the same query.
  const isFirstSyncRef = useRef(true);
  const lastSyncedQueryRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const nextQuery = buildQuery(filterState, index);
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      lastSyncedQueryRef.current = nextQuery;
      return;
    }
    const prev = lastSyncedQueryRef.current;
    const unchanged =
      Object.keys(nextQuery).length === Object.keys(prev).length &&
      Object.entries(nextQuery).every(([k, v]) => prev[k] === v);
    lastSyncedQueryRef.current = nextQuery;
    if (unchanged) return;
    const r = routerRef.current;
    void r.replace({ pathname: r.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [filterState, index]);

  const debouncedFilters = useMemo(() => {
    const shared: MediaFilters = { ...(filterState.shared as MediaFilters) };
    shared.title = debouncedTitle || undefined;
    return {
      shared,
      movie: filterState.movie,
      series: filterState.series,
      movieQualifiers: filterState.movieQualifiers,
      seriesQualifiers: filterState.seriesQualifiers,
    };
  }, [debouncedTitle, filterState]);

  const setValue = (scope: ContentScope, key: string, value: FilterValue | undefined) => {
    setFilterState((s) => {
      const bucket = { ...s[scope] };
      if (value === undefined) delete bucket[key];
      else bucket[key] = value;
      const next = { ...s, [scope]: bucket };
      // Clearing a value clears its qualification too — a stale providerId
      // pointing at an empty selection has nothing left to qualify.
      if (value === undefined && (scope === 'movie' || scope === 'series')) {
        const qualifiersKey = scope === 'movie' ? 'movieQualifiers' : 'seriesQualifiers';
        if (key in next[qualifiersKey]) {
          const qualifiers = { ...next[qualifiersKey] };
          delete qualifiers[key];
          next[qualifiersKey] = qualifiers;
        }
      }
      return next;
    });
  };

  const setQualifier = (scope: QualifierScope, key: string, providerId: number | undefined) => {
    setFilterState((s) => {
      const qualifiersKey = scope === 'movie' ? 'movieQualifiers' : 'seriesQualifiers';
      const qualifiers = { ...s[qualifiersKey] };
      if (providerId === undefined) delete qualifiers[key];
      else qualifiers[key] = providerId;
      return { ...s, [qualifiersKey]: qualifiers };
    });
  };

  const setMovieSort = (v: string) => setFilterState((s) => ({ ...s, movieSort: v }));
  const setSeriesSort = (v: string) => setFilterState((s) => ({ ...s, seriesSort: v }));

  const clearAll = () => setFilterState(EMPTY_FILTER_STATE);

  return {
    filterState,
    debouncedFilters,
    setValue,
    setQualifier,
    setMovieSort,
    setSeriesSort,
    clearAll,
    isActive: isAnyFilterActive(filterState),
    isLoading: rulesLoading,
  };
}
