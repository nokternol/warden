import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { MediaSourceDescriptor } from '@contract/media';
import type { ContentType } from '@contract/schemas';

export type { MediaSourceDescriptor };

export function useMediaSources(): {
  sources: Record<ContentType, MediaSourceDescriptor> | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useApi(api.media.sources, undefined);
  const sources = data
    ? (Object.fromEntries(data.map((d) => [d.contentType, d])) as Record<
        ContentType,
        MediaSourceDescriptor
      >)
    : undefined;
  return { sources, isLoading };
}
