import { contract } from '@contract/index';
import type { MediaQueryRecord } from '@contract/schemas';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { toFilterValues, useMediaQueries } from '../useMediaQueries';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('toFilterValues', () => {
  it('emits registry-keyed entries directly, no rename table', () => {
    expect(toFilterValues({ tagIds: '1,2', hasFile: true })).toEqual([
      { ruleKey: 'tagIds', value: '1,2' },
      { ruleKey: 'hasFile', value: true },
    ]);
  });

  it('drops undefined values rather than persisting them', () => {
    expect(toFilterValues({ title: undefined, tagIds: '1,2' })).toEqual([
      { ruleKey: 'tagIds', value: '1,2' },
    ]);
  });

  it('passes range values through untouched', () => {
    expect(toFilterValues({ year: { min: 2000, max: 2020 } })).toEqual([
      { ruleKey: 'year', value: { min: 2000, max: 2020 } },
    ]);
  });
});

const savedQuery: MediaQueryRecord = {
  id: 1,
  name: 'My query',
  contentType: 'movie',
  filters: [],
  health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('useMediaQueries — save', () => {
  it('posts registry-keyed filters for the given contentType, no translation', async () => {
    let body: unknown;
    server.use(
      mockProcedure(contract.mediaQueries.create, async ({ request }) => {
        body = await request.json();
        return savedQuery;
      }),
      mockProcedure(contract.mediaQueries.list, () => [])
    );

    const { result } = renderHook(() => useMediaQueries(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.save('My query', 'movie', [
      { ruleKey: 'tagIds', value: '1,2' },
      { ruleKey: 'hasFile', value: true },
    ]);

    expect(body).toEqual({
      name: 'My query',
      contentType: 'movie',
      filters: [
        { ruleKey: 'tagIds', value: '1,2' },
        { ruleKey: 'hasFile', value: true },
      ],
    });
  });

  it('posts an instance-scoped value through untouched', async () => {
    let body: unknown;
    server.use(
      mockProcedure(contract.mediaQueries.create, async ({ request }) => {
        body = await request.json();
        return savedQuery;
      }),
      mockProcedure(contract.mediaQueries.list, () => [])
    );

    const { result } = renderHook(() => useMediaQueries(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.save('4k query', 'movie', [
      { ruleKey: 'qualityProfileIds', value: { providerId: 3, ids: [5] } },
    ]);

    expect(body).toEqual({
      name: '4k query',
      contentType: 'movie',
      filters: [{ ruleKey: 'qualityProfileIds', value: { providerId: 3, ids: [5] } }],
    });
  });
});
