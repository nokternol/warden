import { apiKey } from '@app/lib/api/useApi';
import type { MediaFilters } from '@app/types/media';
import { useCallback, useLayoutEffect, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';

interface PaginatedPage<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  yearRange?: { min: number | null; max: number | null };
}

const PAGE_SIZE = 48;

/**
 * Pages through a browse procedure (`api.media.movies` or `api.media.series`).
 * `filters` are browse params as `toBrowseParams` encodes them.
 */
export function usePaginatedMedia<TInput, T>(
  browse: (input: TInput) => Promise<PaginatedPage<T>>,
  filters?: MediaFilters
) {
  const filtersKey = JSON.stringify(filters ?? null);

  const getKey = (pageIndex: number, prev: PaginatedPage<T> | null) => {
    // Do not key page N until page N-1 has loaded. When filters change, the
    // cache for the new keys is empty, so `prev` is null for all pages > 0.
    // This stops SWR from queuing N concurrent fetches on filter change
    // (thundering herd). Normal pagination is unaffected: prev is always a
    // loaded page object by the time fetchMore is called.
    if (pageIndex > 0 && !prev) return null;
    if (prev && prev.items.length === 0) return null;

    // Browse params are the legacy content-prefixed encoding; the browse
    // procedure's input schema parses them server-side.
    const input = { ...filters, page: pageIndex + 1, pageSize: PAGE_SIZE } as TInput;
    return apiKey(browse, input);
  };

  const { data, isLoading, isValidating, setSize, error } = useSWRInfinite<PaginatedPage<T>>(
    getKey,
    ([procedure, input]: ReturnType<typeof apiKey<TInput>>) =>
      procedure(input) as Promise<PaginatedPage<T>>,
    {
      // Don't re-fetch page 1 every time a new page is appended. The default
      // (true) doubles network traffic on every fetchMore call.
      revalidateFirstPage: false,
      // Don't re-fetch all loaded pages when the user returns to the tab.
      // With N pages loaded, the default behavior issues N concurrent requests.
      revalidateOnFocus: false,
    }
  );

  // Reset size to 1 when filters change. useLayoutEffect fires before paint and
  // before the next useEffect pass, closing the window where SWR's own layout
  // effect could start a sequential page waterfall for the new filter key.
  const prevFiltersKeyRef = useRef(filtersKey);
  useLayoutEffect(() => {
    if (prevFiltersKeyRef.current !== filtersKey) {
      prevFiltersKeyRef.current = filtersKey;
      void setSize(1);
    }
  }, [filtersKey, setSize]);

  // Synchronous in-flight guard. `isValidatingRef` is always the current
  // isValidating value so the callback closure never goes stale. `isFetchingRef`
  // is set synchronously on fetchMore entry; this closes the window between the
  // IntersectionObserver firing and React committing the isValidating=true state
  // update (which can span multiple ticks in concurrent-mode renders).
  const isValidatingRef = useRef(isValidating);
  isValidatingRef.current = isValidating;

  const isFetchingRef = useRef(false);
  // Reset the guard during render when validation completes — before React
  // commits the DOM update that remounts the sentinel and creates a new IO.
  if (!isValidating && isFetchingRef.current) {
    isFetchingRef.current = false;
  }

  const items = data ? data.flatMap((page) => page.items) : [];
  const totalCount = data?.[0]?.totalCount ?? 0;
  const yearRange = data?.[0]?.yearRange ?? null;

  return {
    items,
    totalCount,
    yearRange,
    isLoading,
    isFetchingMore: isValidating && !isLoading,
    hasMore: items.length < totalCount,
    fetchMore: useCallback(() => {
      if (isFetchingRef.current || isValidatingRef.current) return;
      isFetchingRef.current = true;
      void setSize((s) => s + 1);
    }, [setSize]),
    error: error as Error | undefined,
  };
}
