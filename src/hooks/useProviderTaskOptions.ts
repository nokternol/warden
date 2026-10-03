import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import {
  type ProviderTaskOption,
  type ProviderTaskOptionsAvailability,
  TaskOptionsRouteSchema,
} from '@contract/providers';

export type { ProviderTaskOption, ProviderTaskOptionsAvailability };

/** The options one provider instance offers for a route — empty if it declares none. */
export function optionsForProvider(
  availability: ProviderTaskOptionsAvailability[] | undefined,
  providerId: number
): ProviderTaskOption[] {
  return availability?.find((a) => a.providerId === providerId)?.options ?? [];
}

/**
 * Instance-keyed live choices for a `select`-parameter task, fetched from its
 * `optionsRoute`. `route` is `undefined` when the selected task has no
 * `select` parameter; it, or a route the contract doesn't declare, skips the
 * fetch.
 */
export function useProviderTaskOptions(route: string | undefined): {
  availability: ProviderTaskOptionsAvailability[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const parsed = TaskOptionsRouteSchema.safeParse(route);
  const { data, error, isLoading } = useApi(
    api.providers.taskOptions,
    parsed.success ? { route: parsed.data } : null
  );
  return { availability: data, isLoading, error };
}
