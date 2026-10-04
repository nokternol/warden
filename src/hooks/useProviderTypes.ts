import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { ProviderType, ProviderTypeDescriptor } from '@contract/providers';

export type { ProviderTypeDescriptor };

/** The served description of `type`; absent while loading or for a type that is not offered. */
export function descriptorFor(
  types: ProviderTypeDescriptor[] | undefined,
  type: ProviderType
): ProviderTypeDescriptor | undefined {
  return types?.find((t) => t.type === type);
}

/**
 * The provider types that can be configured, in display order, with their
 * labels, connection defaults and capability text. The server owns the
 * catalogue; the client derives from it.
 */
export function useProviderTypes(): {
  types: ProviderTypeDescriptor[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useApi(api.providers.types, undefined);
  return { types: data, isLoading, error };
}
