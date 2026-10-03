import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { ProviderDraft, ProviderPatch } from '@contract/providers';
import type { ProviderSummary } from '@contract/schemas';

export type { ProviderSummary };
export type CreateProviderParams = ProviderDraft;
export type UpdateProviderParams = ProviderPatch;

export function useProviderSettings() {
  const { data: providers, isLoading, error, mutate } = useApi(api.providers.list, undefined);

  const create = async (params: CreateProviderParams): Promise<ProviderSummary> => {
    const result = await api.providers.create(params);
    await mutate();
    return result;
  };

  const update = async (id: number, patch: UpdateProviderParams): Promise<ProviderSummary> => {
    const result = await api.providers.update({ id, ...patch });
    await mutate();
    return result;
  };

  const remove = async (id: number): Promise<void> => {
    await api.providers.delete({ id });
    await mutate();
  };

  return {
    providers,
    isLoading,
    error,
    create,
    update,
    remove,
  };
}
