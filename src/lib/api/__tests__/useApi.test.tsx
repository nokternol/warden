import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { server } from '../../../../tests/mocks/server';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const automation = {
  id: 7,
  name: 'Nightly unmonitor',
  kind: 'user' as const,
  query: { id: 1, name: 'Movies', contentType: 'movie' as const },
  queries: [{ queryId: 1, role: 'include' as const, sortOrder: 0 }],
  provider: { id: 1, name: 'Radarr', type: 'RADARR' },
  taskId: 'unmonitorMovie',
  schedule: '0 2 * * *',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useApi', () => {
  it('returns the payload a contract procedure answers, not the envelope around it', async () => {
    server.use(
      http.get('/api/automations', () => HttpResponse.json({ status: 'ok', data: [automation] }))
    );

    const { result } = renderHook(() => useApi(api.automations.list, {}), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([automation]));
  });
});
