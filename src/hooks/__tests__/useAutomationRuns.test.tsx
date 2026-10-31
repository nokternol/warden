import { contract } from '@contract/index';
import { renderHook, waitFor } from '@testing-library/react';
import { mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { useAutomationRuns } from '../useAutomationRuns';

describe('useAutomationRuns', () => {
  it('returns expected interface', () => {
    const { result } = renderHook(() => useAutomationRuns());
    expect(typeof result.current.isLoading).toBe('boolean');
    expect(result.current.runs).toBeUndefined();
    expect(typeof result.current.total).toBe('number');
  });

  it('fetches runs on mount', async () => {
    const { result } = renderHook(() => useAutomationRuns());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.runs?.length).toBeGreaterThan(0);
    const run = result.current.runs?.[0];
    expect(run).toHaveProperty('id');
    expect(run).toHaveProperty('automationId');
    expect(run).toHaveProperty('automationName');
    expect(run).toHaveProperty('status');
    expect(run).toHaveProperty('ranAt');
  });

  it('exposes pagination controls', () => {
    const { result } = renderHook(() => useAutomationRuns());
    expect(typeof result.current.nextPage).toBe('function');
    expect(typeof result.current.prevPage).toBe('function');
    expect(typeof result.current.page).toBe('number');
  });
});

describe('useAutomationRuns failure', () => {
  it('returns the error', async () => {
    server.use(mockProcedureFailure(contract.automations.runs, 500));
    const { result } = renderHook(() => useAutomationRuns(), {
      wrapper: ({ children }) => (
        <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0 }}>{children}</SWRConfig>
      ),
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });
});
