import type { AutomationSchema } from '@contract/schemas';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import type { z } from 'zod';

export type AutomationDto = z.infer<typeof AutomationSchema>;

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

const KEY = '/api/automations';

async function fetchAutomations(url: string): Promise<AutomationDto[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch automations');
  const json = (await res.json()) as { data: AutomationDto[] };
  return json.data;
}

async function createAutomation(
  _key: string,
  { arg }: { arg: CreateAutomationInput }
): Promise<AutomationDto> {
  const res = await fetch(KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? 'Failed to create automation');
  }
  const json = (await res.json()) as { data: AutomationDto };
  return json.data;
}

async function updateStatus(
  _key: string,
  { arg }: { arg: { id: number; status: 'active' | 'paused' } }
): Promise<AutomationDto> {
  const res = await fetch(`${KEY}/${arg.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: arg.status }),
  });
  if (!res.ok) throw new Error('Failed to update automation status');
  const json = (await res.json()) as { data: AutomationDto };
  return json.data;
}

async function deleteAutomation(_key: string, { arg }: { arg: number }): Promise<void> {
  const res = await fetch(`${KEY}/${arg}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete automation');
}

export function useAutomations(options?: { kind?: 'user' | 'system' }) {
  const key = options?.kind ? `${KEY}?kind=${options.kind}` : KEY;
  const { data: automations = [], isLoading, mutate } = useSWR(key, fetchAutomations);

  const { trigger: triggerCreate, isMutating: isCreating } = useSWRMutation(KEY, createAutomation);
  const { trigger: triggerStatus } = useSWRMutation(KEY, updateStatus);
  const { trigger: triggerDelete } = useSWRMutation(KEY, deleteAutomation);

  const create = async (input: CreateAutomationInput): Promise<AutomationDto> => {
    const newAutomation = await triggerCreate(input, { revalidate: false });
    mutate([...automations, newAutomation!], { revalidate: false });
    return newAutomation!;
  };

  const setStatus = async (id: number, status: 'active' | 'paused'): Promise<void> => {
    const updatedAutomation = await triggerStatus({ id, status }, { revalidate: false });
    mutate(
      automations.map((x) => (x.id === id ? updatedAutomation! : x)),
      { revalidate: false }
    );
  };

  const remove = async (id: number): Promise<void> => {
    await triggerDelete(id, { revalidate: false });
    await mutate();
  };

  // Run Now returns 202 once the job is *triggered*, not once it's finished — system jobs and
  // cross-provider tasks can take real time. These staggered revalidations catch the eventual
  // `lastRun` update without the user reloading; a missed window just means the row updates on
  // the next natural revalidation instead.
  const POLL_DELAYS_MS = [1500, 4000, 9000, 18000];

  const run = async (id: number): Promise<void> => {
    const res = await fetch(`${KEY}/${id}/run`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to run automation');
    for (const delay of POLL_DELAYS_MS) {
      setTimeout(() => void mutate(), delay);
    }
  };

  return { automations, isLoading, isCreating, create, setStatus, remove, run };
}
