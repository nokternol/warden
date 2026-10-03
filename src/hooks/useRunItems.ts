import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { RunItemDto } from '@contract/schemas';

export type { RunItemDto };

/** The first page of items one run targeted, with the run's total. */
export function useRunItems(runId: number) {
  const { data, isLoading } = useApi(api.automations.runItems, { runId });
  return { items: data?.data ?? [], total: data?.total ?? 0, isLoading };
}
