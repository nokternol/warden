import type { MediaImage } from '@app/types/media';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { type BrowseRequest, useMovies } from '../useMovies';

// Isolate SWR cache per test
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('useMovies', () => {
  it('returns expected interface shape', () => {
    const { result } = renderHook(() => useMovies(), { wrapper });

    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.isFetchingMore).toBe('boolean');
    expect(typeof result.current.hasMore).toBe('boolean');
    expect(typeof result.current.fetchMore).toBe('function');
    expect(result.current.error === undefined || result.current.error instanceof Error).toBe(true);
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(typeof result.current.totalCount).toBe('number');
  });

  it('isLoading is true before first page resolves', () => {
    const { result } = renderHook(() => useMovies(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it('loads first page on mount', async () => {
    const { result } = renderHook(() => useMovies(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.length).toBe(48);
    expect(result.current.totalCount).toBe(96);
    expect(result.current.items[0]).toHaveProperty('title', 'Movie 1');
    expect(result.current.items[47]).toHaveProperty('title', 'Movie 48');
  });

  it('hasMore is true when items.length < totalCount', async () => {
    const { result } = renderHook(() => useMovies(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasMore).toBe(true); // 48 loaded < 96 total
  });

  it('hasMore is false when all items are loaded', async () => {
    const { result } = renderHook(() => useMovies(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.fetchMore();
    await waitFor(() => expect(result.current.items.length).toBe(96));

    expect(result.current.hasMore).toBe(false);
  });

  it('fetchMore appends second page to items', async () => {
    const { result } = renderHook(() => useMovies(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.length).toBe(48);

    result.current.fetchMore();

    await waitFor(() => expect(result.current.items.length).toBe(96));

    expect(result.current.items[48]).toHaveProperty('title', 'Movie 49');
    expect(result.current.items[95]).toHaveProperty('title', 'Movie 96');
  });

  it('MediaImage is exported from @app/types/media', () => {
    // Structural check: MediaImage must have the shape { coverType, remoteUrl }
    const img: MediaImage = { coverType: 'poster', remoteUrl: 'https://example.com/img.jpg' };
    expect(img.coverType).toBe('poster');
    expect(img.remoteUrl).toBe('https://example.com/img.jpg');
  });

  it('resets to page 1 when filters change', async () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useMovies>,
      { request?: BrowseRequest }
    >(({ request }) => useMovies(request), { wrapper, initialProps: { request: undefined } });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.fetchMore();
    await waitFor(() => expect(result.current.items.length).toBe(96));

    rerender({ request: { filters: [{ ruleKey: 'monitored', value: true }] } });

    await waitFor(() => {
      expect(result.current.items.length).toBeLessThanOrEqual(48);
    });
  });
});
