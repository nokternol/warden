import { api } from '@app/lib/api/client';
import useSWRMutation from 'swr/mutation';

export function useMediaReset() {
  const { trigger, isMutating } = useSWRMutation([api.media.reset], () => api.media.reset());
  return { reset: trigger, isResetting: isMutating };
}
