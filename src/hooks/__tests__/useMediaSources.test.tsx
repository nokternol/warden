import { contract } from '@contract/index';
import type { MediaSourceDescriptor } from '@contract/media';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { useMediaSources } from '../useMediaSources';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useMediaSources', () => {
  it('exposes the ownership projection keyed by content type', async () => {
    server.use(
      mockProcedure(contract.media.sources, (): MediaSourceDescriptor[] => [
        {
          contentType: 'movie',
          ownerType: 'RADARR',
          configured: true,
          instances: [{ id: 1, name: 'Radarr' }],
        },
        { contentType: 'series', ownerType: 'SONARR', configured: false, instances: [] },
      ])
    );

    const { result } = renderHook(() => useMediaSources(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sources).toEqual({
      movie: {
        contentType: 'movie',
        ownerType: 'RADARR',
        configured: true,
        instances: [{ id: 1, name: 'Radarr' }],
      },
      series: { contentType: 'series', ownerType: 'SONARR', configured: false, instances: [] },
    });
  });
});
