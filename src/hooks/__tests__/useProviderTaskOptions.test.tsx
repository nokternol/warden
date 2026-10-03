import { contract } from '@contract/index';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { optionsForProvider, useProviderTaskOptions } from '../useProviderTaskOptions';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useProviderTaskOptions', () => {
  it('fetches instance-keyed options for the given route', async () => {
    server.use(
      mockProcedure(contract.providers.taskOptions, () => [
        {
          providerId: 1,
          type: 'RADARR',
          options: [
            { id: '1', label: 'HD-1080p' },
            { id: '2', label: 'Any' },
          ],
        },
      ])
    );

    const { result } = renderHook(() => useProviderTaskOptions('quality-profiles'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(optionsForProvider(result.current.availability, 1)).toEqual([
      { id: '1', label: 'HD-1080p' },
      { id: '2', label: 'Any' },
    ]);
    expect(optionsForProvider(result.current.availability, 999)).toEqual([]);
  });

  it('skips the fetch entirely when route is undefined', () => {
    const { result } = renderHook(() => useProviderTaskOptions(undefined), { wrapper });
    expect(result.current.availability).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
