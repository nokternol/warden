import { contract } from '@contract/index';
import type { MediaRuleDescriptor } from '@contract/media';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { useMediaRules } from '../useMediaRules';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useMediaRules', () => {
  it('exposes the provider-gated rule descriptors projected by media.rules', async () => {
    server.use(
      mockProcedure(contract.media.rules, (): MediaRuleDescriptor[] => [
        {
          key: 'year',
          label: 'Year',
          contentTypes: ['movie', 'series'],
          dataType: 'range',
          providers: ['RADARR', 'SONARR'],
          required: false,
        },
      ])
    );

    const { result } = renderHook(() => useMediaRules(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rules).toEqual([
      expect.objectContaining({ key: 'year', dataType: 'range' }),
    ]);
  });

  it('scopes the request to a content type via the query string', async () => {
    server.use(
      mockProcedure(contract.media.rules, ({ request }): MediaRuleDescriptor[] =>
        new URL(request.url).searchParams.get('contentType') === 'movie'
          ? [
              {
                key: 'tagIds',
                label: 'Tags',
                contentTypes: ['movie'],
                dataType: 'instance-ids',
                providers: ['RADARR'],
                required: false,
              },
            ]
          : []
      )
    );

    const { result } = renderHook(() => useMediaRules('movie'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rules).toEqual([expect.objectContaining({ key: 'tagIds' })]);
  });
});
