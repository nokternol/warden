/**
 * useMediaFilters — derives its field vocabulary from the server rule
 * registry (`useMediaRules`) instead of a static client-side catalogue.
 * FilterState is scoped `{ shared, movie, series }` so the registry's
 * intentionally-reused keys (tagIds, qualityProfileIds, genres) can hold
 * independent movie/series values without collision.
 *
 * Run: vitest run --project client
 */
import { contract } from '@contract/index';
import type { MediaRuleDescriptor } from '@contract/media';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { useMediaFilters } from '../useMediaFilters';

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn().mockResolvedValue(true),
}));

let mockRouterQuery: Record<string, string> = {};

vi.mock('next/router', () => ({
  useRouter: () => ({
    get query() {
      return mockRouterQuery;
    },
    pathname: '/media',
    replace: mockReplace,
    basePath: '',
    route: '/',
    asPath: '/',
    isReady: true,
  }),
}));

const RULES: MediaRuleDescriptor[] = [
  {
    key: 'title',
    label: 'Title',
    contentTypes: ['movie', 'series'],
    dataType: 'string',
  },
  {
    key: 'year',
    label: 'Year',
    contentTypes: ['movie', 'series'],
    dataType: 'range',
  },
  {
    key: 'hasFile',
    label: 'Has file',
    contentTypes: ['movie', 'series'],
    dataType: 'boolean',
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['movie'],
    dataType: 'instance-ids',
    lookup: 'tags',
  },
  {
    key: 'tagIds',
    label: 'Tags',
    contentTypes: ['series'],
    dataType: 'instance-ids',
    lookup: 'tags',
  },
  {
    key: 'imdbRating',
    label: 'IMDB rating',
    contentTypes: ['movie'],
    dataType: 'range',
  },
];

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

beforeEach(() => {
  mockRouterQuery = {};
  mockReplace.mockClear();
  server.use(mockProcedure(contract.media.rules, () => RULES));
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderReady() {
  const view = renderHook(() => useMediaFilters(), { wrapper });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe('useMediaFilters — initial state', () => {
  it('starts empty when router.query is empty', async () => {
    const { result } = await renderReady();
    expect(result.current.filterState.shared.title).toBe('');
    expect(result.current.filterState.movie.tagIds).toBeUndefined();
    expect(result.current.filterState.series.tagIds).toBeUndefined();
  });

  it('parses a shared scalar field from the URL', async () => {
    mockRouterQuery = { title: 'batman' };
    const { result } = await renderReady();
    expect(result.current.filterState.shared.title).toBe('batman');
  });

  it('parses a range field into { min, max } once rules load', async () => {
    mockRouterQuery = { yearMin: '2010', yearMax: '2020' };
    const { result } = renderHook(() => useMediaFilters(), { wrapper });
    await waitFor(() =>
      expect(result.current.filterState.shared.year).toEqual({ min: 2010, max: 2020 })
    );
  });

  it('keeps movie.tagIds and show.tagIds independent for the colliding registry key', async () => {
    mockRouterQuery = { movieTagIds: '1,2', seriesTagIds: '3,4' };
    const { result } = await renderReady();
    expect(result.current.filterState.movie.tagIds).toBe('1,2');
    expect(result.current.filterState.series.tagIds).toBe('3,4');
  });
});

describe('useMediaFilters — setValue', () => {
  it('updates a shared value immediately', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('shared', 'title', 'matrix'));
    expect(result.current.filterState.shared.title).toBe('matrix');
  });

  it('scopes a movie-only value without touching series', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'tagIds', '1,2'));
    expect(result.current.filterState.movie.tagIds).toBe('1,2');
    expect(result.current.filterState.series.tagIds).toBeUndefined();
  });

  it('setValue(undefined) clears the field', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'tagIds', '1,2'));
    act(() => result.current.setValue('movie', 'tagIds', undefined));
    expect(result.current.filterState.movie.tagIds).toBeUndefined();
  });
});

describe('useMediaFilters — title debounce', () => {
  it('debouncedFilters.shared.title lags filterState.shared.title until 300ms pass', async () => {
    const { result } = await renderReady();
    vi.useFakeTimers();

    act(() => result.current.setValue('shared', 'title', 'batman'));
    expect(result.current.filterState.shared.title).toBe('batman');
    expect(result.current.debouncedFilters.shared.title).toBeUndefined();

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.debouncedFilters.shared.title).toBe('batman');
  });

  it('non-title values are immediate in debouncedFilters', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'hasFile', true));
    expect(result.current.debouncedFilters.movie.hasFile).toBe(true);
  });
});

describe('useMediaFilters — URL sync', () => {
  it('does not call router.replace on initial mount', async () => {
    await renderReady();
    await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
  });

  it('serializes a scoped, colliding key with its scope prefix', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'tagIds', '1,2'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const query = mockReplace.mock.calls.at(-1)![0].query as Record<string, string>;
    expect(query.movieTagIds).toBe('1,2');
  });

  it('serializes a range value as Min/Max param pairs', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('shared', 'year', { min: 2000, max: 2020 }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const query = mockReplace.mock.calls.at(-1)![0].query as Record<string, string>;
    expect(query.yearMin).toBe('2000');
    expect(query.yearMax).toBe('2020');
  });

  it('clears URL params on clearAll', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'hasFile', true));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    mockReplace.mockClear();

    act(() => result.current.clearAll());
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ query: {} }), undefined, {
        shallow: true,
      })
    );
  });
});

describe('useMediaFilters — sort keys are not rules', () => {
  it('setMovieSort/setSeriesSort update filterState but stay out of debouncedFilters', async () => {
    const { result } = await renderReady();
    act(() => {
      result.current.setMovieSort('year_desc');
      result.current.setSeriesSort('status_asc');
    });
    expect(result.current.filterState.movieSort).toBe('year_desc');
    expect(result.current.filterState.seriesSort).toBe('status_asc');
    expect(result.current.debouncedFilters).not.toHaveProperty('movieSort');
    expect(result.current.debouncedFilters).not.toHaveProperty('seriesSort');
  });

  it('sort is excluded from isActive', async () => {
    const { result } = await renderReady();
    act(() => result.current.setMovieSort('year_desc'));
    expect(result.current.isActive).toBe(false);
  });

  it('sort state survives clearAll', async () => {
    const { result } = await renderReady();
    act(() => {
      result.current.setMovieSort('year_desc');
      result.current.setValue('movie', 'hasFile', true);
    });
    act(() => result.current.clearAll());
    expect(result.current.filterState.movieSort).toBe('title_asc');
    expect(result.current.filterState.movie.hasFile).toBeUndefined();
  });
});

describe('useMediaFilters — instance qualifiers', () => {
  it('starts with no qualifiers', async () => {
    const { result } = await renderReady();
    expect(result.current.filterState.movieQualifiers).toEqual({});
    expect(result.current.filterState.seriesQualifiers).toEqual({});
  });

  it('setQualifier scopes to movie/series independently', async () => {
    const { result } = await renderReady();
    act(() => result.current.setQualifier('movie', 'tagIds', 5));
    expect(result.current.filterState.movieQualifiers.tagIds).toBe(5);
    expect(result.current.filterState.seriesQualifiers.tagIds).toBeUndefined();
  });

  it('setQualifier(undefined) clears the qualifier', async () => {
    const { result } = await renderReady();
    act(() => result.current.setQualifier('movie', 'tagIds', 5));
    act(() => result.current.setQualifier('movie', 'tagIds', undefined));
    expect(result.current.filterState.movieQualifiers.tagIds).toBeUndefined();
  });

  it('clearing a value drops its qualifier too', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'tagIds', '1,2'));
    act(() => result.current.setQualifier('movie', 'tagIds', 5));
    act(() => result.current.setValue('movie', 'tagIds', undefined));
    expect(result.current.filterState.movieQualifiers.tagIds).toBeUndefined();
  });

  it('round-trips a qualifier through the URL as a ProviderId sibling param', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('movie', 'tagIds', '1,2'));
    act(() => result.current.setQualifier('movie', 'tagIds', 5));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    const query = mockReplace.mock.calls.at(-1)![0].query as Record<string, string>;
    expect(query.movieTagIdsProviderId).toBe('5');
  });

  it('parses a ProviderId param back into the qualifiers bucket', async () => {
    mockRouterQuery = { movieTagIds: '1,2', movieTagIdsProviderId: '5' };
    const { result } = await renderReady();
    expect(result.current.filterState.movieQualifiers.tagIds).toBe(5);
  });
});

describe('useMediaFilters — isActive', () => {
  it('is false with nothing set', async () => {
    const { result } = await renderReady();
    expect(result.current.isActive).toBe(false);
  });

  it('is true when a shared value is set', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('shared', 'title', 'batman'));
    expect(result.current.isActive).toBe(true);
  });

  it('is true when only a series-scoped value is set', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('series', 'tagIds', '3,4'));
    expect(result.current.isActive).toBe(true);
  });

  it('returns to false after clearAll', async () => {
    const { result } = await renderReady();
    act(() => result.current.setValue('shared', 'title', 'matrix'));
    act(() => result.current.clearAll());
    expect(result.current.isActive).toBe(false);
  });
});
