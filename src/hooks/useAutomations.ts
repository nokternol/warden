import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { AutomationDto } from '@contract/schemas';
import { useState } from 'react';

export type { AutomationDto };

export interface QuerySourceInput {
  queryId: number;
  role: 'include' | 'exclude';
  sortOrder: number;
}

export interface CreateAutomationInput {
  name: string;
  querySources: QuerySourceInput[];
  providerId: number;
  taskId: string;
  taskParameter?: string;
  schedule: string;
}

// Run Now returns 202 once the job is *triggered*, not once it's finished — system jobs and
// cross-provider tasks can take real time. These staggered revalidations catch the eventual
// `lastRun` update without the user reloading; a missed window just means the row updates on
// the next natural revalidation instead.
const POLL_DELAYS_MS = [1500, 4000, 9000, 18000];

export function useAutomations(options?: { kind?: 'user' | 'system' }) {
  const {
    data: automations = [],
    isLoading,
    mutate,
  } = useApi(api.automations.list, { kind: options?.kind });
  const [isCreating, setIsCreating] = useState(false);

  const create = async (input: CreateAutomationInput): Promise<AutomationDto> => {
    setIsCreating(true);
    try {
      const newAutomation = await api.automations.create(input);
      mutate([...automations, newAutomation], { revalidate: false });
      return newAutomation;
    } finally {
      setIsCreating(false);
    }
  };

  const setStatus = async (id: number, status: 'active' | 'paused'): Promise<void> => {
    const updatedAutomation = await api.automations.updateStatus({ id, status });
    mutate(
      automations.map((x) => (x.id === id ? updatedAutomation : x)),
      { revalidate: false }
    );
  };

  const remove = async (id: number): Promise<void> => {
    await api.automations.delete({ id });
    await mutate();
  };

  const run = async (id: number): Promise<void> => {
    await api.automations.run({ id });
    for (const delay of POLL_DELAYS_MS) {
      setTimeout(() => void mutate(), delay);
    }
  };

  return { automations, isLoading, isCreating, create, setStatus, remove, run };
}
