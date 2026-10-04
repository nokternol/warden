import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type {
  ContentType,
  Filter,
  FilterValueSchema,
  MediaQueryRecord,
  QueryHealthSchema,
} from '@contract/schemas';
import type { z } from 'zod';

export type FilterValue = z.infer<typeof FilterValueSchema>;
export type { Filter };
export type QueryHealth = z.infer<typeof QueryHealthSchema>;
export type { MediaQueryRecord };

export function useMediaQueries() {
  const { data: queries = [], isLoading, mutate } = useApi(api.mediaQueries.list, undefined);

  const save = async (
    name: string,
    contentType: ContentType,
    filters: Filter[]
  ): Promise<MediaQueryRecord> => {
    const query = await api.mediaQueries.create({ name, contentType, filters });
    await mutate();
    return query;
  };

  const remove = async (id: number): Promise<void> => {
    await api.mediaQueries.delete({ id });
    await mutate();
  };

  return { queries, isLoading, save, remove };
}
