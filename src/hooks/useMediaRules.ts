import type { ContentTypeSchema } from '@contract/schemas';
import useSWR from 'swr';
import type { z } from 'zod';

type ContentType = z.infer<typeof ContentTypeSchema>;

export interface MediaRuleDescriptor {
  key: string;
  label: string;
  contentTypes: ContentType[];
  dataType: 'boolean' | 'number' | 'string' | 'csv-ids' | 'csv-strings' | 'range';
  sourceProviders: string[];
  required: boolean;
  /** True for rules whose values are a provider-defined id space (quality profiles, tags) —
   *  the client must qualify these per instance when more than one is active. */
  instanceScoped?: boolean;
}

const KEY = '/api/filter-fields';

async function fetcher(url: string): Promise<MediaRuleDescriptor[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch filter fields');
  return res.json();
}

export function useMediaRules(contentType?: ContentType): {
  rules: MediaRuleDescriptor[] | undefined;
  isLoading: boolean;
} {
  const key = contentType ? `${KEY}?contentType=${contentType}` : KEY;
  const { data, isLoading } = useSWR<MediaRuleDescriptor[]>(key, fetcher);
  return { rules: data, isLoading };
}
