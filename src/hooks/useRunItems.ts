import { api } from '@app/lib/api/client';
import { apiKey } from '@app/lib/api/useApi';
import type { RunItemDto } from '@contract/schemas';
import useSWRInfinite from 'swr/infinite';

export type { RunItemDto };

const PAGE_SIZE = 100;

type RunItemsInput = Parameters<typeof api.automations.runItems>[0];

/** The items one run targeted, a page at a time, with the run's total. */
export function useRunItems(runId: number) {
  const { data, isLoading, isValidating, error, setSize, mutate } = useSWRInfinite<{
    data: RunItemDto[];
    total: number;
  }>(
    (page: number) =>
      apiKey(api.automations.runItems, { runId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    ([, input]: readonly [unknown, RunItemsInput]) => api.automations.runItems(input)
  );
  return {
    items: data?.flatMap((page) => page.data),
    total: data?.[0]?.total ?? 0,
    isLoading,
    isFetchingMore: isValidating && !isLoading,
    error,
    refresh: mutate,
    loadMore: () => setSize((size) => size + 1),
  };
}
