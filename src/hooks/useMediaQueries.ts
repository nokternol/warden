import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type {
  ContentType,
  FilterValueEntrySchema,
  FilterValueSchema,
  MediaQueryRecord,
  QueryHealthSchema,
} from '@contract/schemas';
import type { z } from 'zod';

export type FilterValue = z.infer<typeof FilterValueSchema>;
export type FilterValueEntry = z.infer<typeof FilterValueEntrySchema>;
export type QueryHealth = z.infer<typeof QueryHealthSchema>;
export type { MediaQueryRecord };

/** The client speaks registry keys directly — no rename table between here and `MEDIA_RULES`. */
export function toFilterValues(
  values: Record<string, FilterValue | undefined>
): FilterValueEntry[] {
  return Object.entries(values)
    .filter((entry): entry is [string, FilterValue] => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value }));
}

export function useMediaQueries() {
  const { data: queries = [], isLoading, mutate } = useApi(api.mediaQueries.list, undefined);

  const save = async (
    name: string,
    contentType: ContentType,
    filterValues: FilterValueEntry[]
  ): Promise<MediaQueryRecord> => {
    const query = await api.mediaQueries.create({ name, contentType, filterValues });
    await mutate();
    return query;
  };

  const remove = async (id: number): Promise<void> => {
    await api.mediaQueries.delete({ id });
    await mutate();
  };

  return { queries, isLoading, save, remove };
}
