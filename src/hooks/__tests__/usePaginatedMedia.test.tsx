import { api } from '@app/lib/api/client';
import { contract } from '@contract/index';
import { renderHook, waitFor } from '@testing-library/react';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import type { useMovies } from '../useMovies';
import { type BrowseRequest, usePaginatedMedia } from '../usePaginatedMedia';

const EMPTY_PAGE = {
  items: [],
  totalCount: 0,
  page: 1,
  pageSize: 48,
  yearRange: { min: null, max: null },
  errors: [],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('usePaginatedMedia', () => {
  it('returns the expected interface shape on mount', () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.isFetchingMore).toBe('boolean');
    expect(typeof result.current.hasMore).toBe('boolean');
    expect(typeof result.current.fetchMore).toBe('function');
    expect(result.current.error === undefined || result.current.error instanceof Error).toBe(true);
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(typeof result.current.totalCount).toBe('number');
  });

  it('isLoading is true before first page resolves', () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('fetches first page of items from the given endpoint', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.length).toBe(48);
    expect(result.current.totalCount).toBe(96);
    expect(result.current.items[0]).toHaveProperty('title', 'Movie 1');
    expect(result.current.items[47]).toHaveProperty('title', 'Movie 48');
  });

  it('is generic — works with the series endpoint', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.series), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items[0]).toHaveProperty('title', 'Breaking Bad');
    expect(result.current.totalCount).toBe(10);
  });

  it('exposes yearRange from the first page', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.yearRange).toEqual({ min: 2000, max: 2029 });
  });

  it('hasMore is true when loaded items < totalCount', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasMore).toBe(true); // 48 loaded < 96 total
  });

  it('fetchMore appends the second page', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.length).toBe(48);

    result.current.fetchMore();

    await waitFor(() => expect(result.current.items.length).toBe(96));
    expect(result.current.items[48]).toHaveProperty('title', 'Movie 49');
    expect(result.current.items[95]).toHaveProperty('title', 'Movie 96');
  });

  it('hasMore is false when all pages are loaded', async () => {
    const { result } = renderHook(() => usePaginatedMedia(api.media.browse.movie), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.fetchMore();
    await waitFor(() => expect(result.current.items.length).toBe(96));

    expect(result.current.hasMore).toBe(false);
  });

  it('sends the filter entries as the JSON filters param', async () => {
    const capturedUrl = { value: '' };
    server.use(
      mockProcedure(contract.media.browse.movie, ({ request }) => {
        capturedUrl.value = request.url;
        return EMPTY_PAGE;
      })
    );
    const filters = [
      { ruleKey: 'hasFile', value: true },
      { ruleKey: 'year', value: { min: 2010 } },
    ];

    const { result } = renderHook(
      () => usePaginatedMedia(api.media.browse.movie, { filters, sort: 'year_desc' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const url = new URL(capturedUrl.value);
    expect(JSON.parse(url.searchParams.get('filters') ?? '')).toEqual(filters);
    expect(url.searchParams.get('sort')).toBe('year_desc');
  });

  it('resets to page 1 when filters change', async () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useMovies>,
      { request?: BrowseRequest }
    >(({ request }) => usePaginatedMedia(api.media.browse.movie, request), {
      wrapper,
      initialProps: { request: undefined },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.fetchMore();
    await waitFor(() => expect(result.current.items.length).toBe(96));

    rerender({ request: { filters: [{ ruleKey: 'monitored', value: true }] } });

    await waitFor(() => {
      expect(result.current.items.length).toBeLessThanOrEqual(48);
    });
  });
});
