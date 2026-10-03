import { api } from '@app/lib/api/client';
import useSWRMutation from 'swr/mutation';

interface FetchRatingsArgs {
  title: string;
  year?: number;
  tmdbApiKey?: string;
  omdbApiKey?: string;
}

export function useRatings() {
  const { trigger, data, error, isMutating } = useSWRMutation(
    [api.providers.ratings],
    (_key, { arg }: { arg: FetchRatingsArgs }) => api.providers.ratings(arg)
  );

  return {
    trigger,
    data,
    error: error as Error | undefined,
    isLoading: isMutating,
  };
}
