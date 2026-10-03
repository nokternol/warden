import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { ProviderTask, ProviderTaskAvailability, TaskParameter } from '@contract/providers';

/** One actuator task an instance offers, and whether it is enabled there. */
export type ProviderTaskDescriptor = ProviderTask;
export type { ProviderTaskAvailability };
export type ProviderTaskParameter = TaskParameter;

/** The tasks declared by one provider instance — empty if it declares none (or is no actuator). */
export function tasksForProvider(
  availability: ProviderTaskAvailability[] | undefined,
  providerId: number
): ProviderTaskDescriptor[] {
  return availability?.find((a) => a.providerId === providerId)?.tasks ?? [];
}

/**
 * Instance-keyed actuator task availability, the single source of what tasks
 * exist client-side. The server owns the catalogue; the client derives from it.
 */
export function useProviderTasks(): {
  availability: ProviderTaskAvailability[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useApi(api.providers.tasks, undefined);
  return { availability: data, isLoading, error };
}
