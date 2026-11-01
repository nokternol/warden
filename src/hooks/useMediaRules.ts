import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { MediaRuleDescriptor } from '@contract/media';
import type { ContentType } from '@contract/schemas';

export function useMediaRules(contentType?: ContentType): {
  rules: MediaRuleDescriptor[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  refresh: () => unknown;
} {
  const { data, isLoading, error, mutate } = useApi(api.media.rules, { contentType });
  return { rules: data, isLoading, error, refresh: mutate };
}
