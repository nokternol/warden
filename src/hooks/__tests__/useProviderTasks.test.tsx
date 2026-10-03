import { contract } from '@contract/index';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { contractPath, mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { tasksForProvider, useProviderTasks } from '../useProviderTasks';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

describe('useProviderTasks', () => {
  it('exposes instance-keyed availability and selects a provider instance by id', async () => {
    server.use(
      mockProcedure(contract.providers.tasks, () => [
        {
          providerId: 1,
          type: 'RADARR',
          tasks: [
            {
              id: 'unmonitorMovie',
              label: 'Unmonitor movie',
              destructive: false,
              enabled: true,
            },
            {
              id: 'deleteMovieWithFiles',
              label: 'Delete movie + files',
              destructive: true,
              enabled: false,
            },
          ],
        },
      ])
    );

    const { result } = renderHook(() => useProviderTasks(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.availability).toHaveLength(1);
    const tasks = tasksForProvider(result.current.availability, 1);
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'unmonitorMovie', enabled: true }));
    expect(tasks).toContainEqual(
      expect.objectContaining({ id: 'deleteMovieWithFiles', destructive: true, enabled: false })
    );
    expect(tasksForProvider(result.current.availability, 999)).toEqual([]);
  });

  it('treats an empty payload as no availability', async () => {
    server.use(mockProcedure(contract.providers.tasks, () => []));

    const { result } = renderHook(() => useProviderTasks(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.availability).toEqual([]);
    expect(tasksForProvider(result.current.availability, 1)).toEqual([]);
  });

  it('surfaces a fetch failure without throwing — availability stays undefined', async () => {
    server.use(
      http.get(
        contractPath(contract.providers.tasks),
        () => new HttpResponse(null, { status: 500 })
      )
    );

    const { result } = renderHook(() => useProviderTasks(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());

    expect(result.current.availability).toBeUndefined();
    expect(tasksForProvider(result.current.availability, 1)).toEqual([]);
  });
});
