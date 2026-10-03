import { contract } from '@contract/index';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../tests/mocks/contract';
import { server } from '../../../tests/mocks/server';
import { type AutomationDto, useAutomations } from '../useAutomations';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

const makeAutomation = (overrides: Partial<AutomationDto> = {}): AutomationDto => ({
  id: 1,
  name: 'Test Automation',
  kind: 'user',
  query: { id: 1, name: 'My Query', contentType: 'movie' as const },
  querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
  provider: { id: 1, name: 'Radarr', type: 'RADARR' },
  taskId: 'delete-movie',
  schedule: '0 * * * *',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('useAutomations — create sends querySources', () => {
  it('sends querySources array in POST body when creating an automation', async () => {
    let capturedBody: unknown;
    const newAutomation = makeAutomation({ id: 2, name: 'New' });

    server.use(
      mockProcedure(contract.automations.list, () => []),
      mockProcedure(contract.automations.create, async ({ request }) => {
        capturedBody = await request.json();
        return newAutomation;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({
        name: 'New',
        querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
        providerId: 1,
        taskId: 'delete-movie',
        schedule: '0 * * * *',
      });
    });

    expect(capturedBody).toMatchObject({
      querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
    });
    expect(capturedBody).not.toHaveProperty('queryId');
  });

  it('sends taskParameter in the POST body when creating a parameterized automation', async () => {
    let capturedBody: unknown;
    const newAutomation = makeAutomation({ id: 3, name: 'Parameterized' });

    server.use(
      mockProcedure(contract.automations.list, () => []),
      mockProcedure(contract.automations.create, async ({ request }) => {
        capturedBody = await request.json();
        return newAutomation;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.create({
        name: 'Parameterized',
        querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
        providerId: 1,
        taskId: 'changeQualityProfile',
        taskParameter: '7',
        schedule: '0 * * * *',
      });
    });

    expect(capturedBody).toMatchObject({ taskParameter: '7' });
  });
});

describe('useAutomations — kind filter', () => {
  it('requests ?kind=system when called with { kind: "system" }', async () => {
    let requestedUrl = '';
    server.use(
      mockProcedure(contract.automations.list, ({ request }) => {
        requestedUrl = request.url;
        return [];
      })
    );

    const { result } = renderHook(() => useAutomations({ kind: 'system' }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(requestedUrl).toContain('kind=system');
  });
});

describe('useAutomations — run now', () => {
  it('POSTs to /api/automations/:id/run when run() is called', async () => {
    const requests: string[] = [];
    server.use(
      mockProcedure(contract.automations.list, () => [makeAutomation({ id: 7 })]),
      mockProcedure(contract.automations.run, ({ request }) => {
        requests.push(`POST ${request.url}`);
        return null;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.run(7);
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/\/api\/automations\/7\/run$/);
  });
});

describe('useAutomations — network call count', () => {
  it('create fires exactly one network request (POST, no subsequent GET)', async () => {
    const requests: string[] = [];
    const newAutomation = makeAutomation({ id: 2, name: 'New' });

    server.use(
      mockProcedure(contract.automations.list, ({ request }) => {
        requests.push(`GET ${request.url}`);
        return [];
      }),
      mockProcedure(contract.automations.create, ({ request }) => {
        requests.push(`POST ${request.url}`);
        return newAutomation;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Clear the initial GET from mount
    requests.length = 0;

    await act(async () => {
      await result.current.create({
        name: 'New',
        querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
        providerId: 1,
        taskId: 'delete-movie',
        schedule: '0 * * * *',
      });
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/^POST/);
  });

  it('setStatus fires exactly one network request (PATCH, no subsequent GET)', async () => {
    const requests: string[] = [];
    const existing = makeAutomation({ id: 1, status: 'active' });
    const updated = makeAutomation({ id: 1, status: 'paused' });

    server.use(
      mockProcedure(contract.automations.list, ({ request }) => {
        requests.push(`GET ${request.url}`);
        return [existing];
      }),
      mockProcedure(contract.automations.updateStatus, ({ request }) => {
        requests.push(`PATCH ${request.url}`);
        return updated;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Clear the initial GET from mount
    requests.length = 0;

    await act(async () => {
      await result.current.setStatus(1, 'paused');
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/^PATCH/);
  });

  it('remove fires two network requests (DELETE then GET refetch)', async () => {
    const requests: string[] = [];
    const existing = makeAutomation({ id: 1 });

    server.use(
      mockProcedure(contract.automations.list, ({ request }) => {
        requests.push(`GET ${request.url}`);
        return [existing];
      }),
      mockProcedure(contract.automations.delete, ({ request }) => {
        requests.push(`DELETE ${request.url}`);
        return null;
      })
    );

    const { result } = renderHook(() => useAutomations(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Clear the initial GET from mount
    requests.length = 0;

    await act(async () => {
      await result.current.remove(1);
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatch(/^DELETE/);
    expect(requests[1]).toMatch(/^GET/);
  });
});
