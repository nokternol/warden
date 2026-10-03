import type { FetchResponse } from '@app/types/fetch';
import type { ContentTypeSchema } from '@contract/schemas';
import useSWR from 'swr';
import type { z } from 'zod';

type ContentType = z.infer<typeof ContentTypeSchema>;

/** One content type's ownership as projected by GET /api/media/sources. */
export interface MediaSourceDescriptor {
  contentType: ContentType;
  ownerType: string;
  configured: boolean;
  /** Every active instance owning this content type — never collapsed to one. */
  instances: Array<{ id: number; name: string }>;
}

const KEY = '/api/media/sources';

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch media sources');
  const json = await res.json<FetchResponse<MediaSourceDescriptor[]>>();
  return json.data;
}

export function useMediaSources(): {
  sources: Record<ContentType, MediaSourceDescriptor> | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useSWR(KEY, fetcher);
  const sources = data
    ? (Object.fromEntries(data.map((d) => [d.contentType, d])) as Record<
        ContentType,
        MediaSourceDescriptor
      >)
    : undefined;
  return { sources, isLoading };
}
