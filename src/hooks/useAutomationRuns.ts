import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { AutomationRunDto } from '@contract/schemas';
import { useState } from 'react';

export type { AutomationRunDto };

export const RUNS_PAGE_SIZE = 25;

export function useAutomationRuns(opts: { automationId?: number } = {}) {
  const [page, setPage] = useState(0);

  const { data, isLoading, error, mutate } = useApi(api.automations.runs, {
    limit: RUNS_PAGE_SIZE,
    offset: page * RUNS_PAGE_SIZE,
    automationId: opts.automationId,
  });

  return {
    runs: data?.data,
    total: data?.total ?? 0,
    isLoading,
    error,
    page,
    nextPage: () => setPage((p) => p + 1),
    prevPage: () => setPage((p) => Math.max(0, p - 1)),
    refresh: mutate,
  };
}
