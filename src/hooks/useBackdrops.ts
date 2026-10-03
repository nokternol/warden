import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';

export const useBackdrops = () => {
  const { data: backdrops } = useApi(api.media.backdrops, undefined, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  return { backdrops };
};
