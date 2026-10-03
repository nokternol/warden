import type {
  ContentTypeSchema,
  FilterValueEntrySchema,
  FilterValueSchema,
  MediaQueryRecordSchema,
  QueryHealthSchema,
} from '@contract/schemas';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import type { z } from 'zod';

export type ContentType = z.infer<typeof ContentTypeSchema>;
export type FilterValue = z.infer<typeof FilterValueSchema>;
export type FilterValueEntry = z.infer<typeof FilterValueEntrySchema>;
export type QueryHealth = z.infer<typeof QueryHealthSchema>;
export type MediaQueryRecord = z.infer<typeof MediaQueryRecordSchema>;

/** The client speaks registry keys directly — no rename table between here and `MEDIA_RULES`. */
export function toFilterValues(
  values: Record<string, FilterValue | undefined>
): FilterValueEntry[] {
  return Object.entries(values)
    .filter((entry): entry is [string, FilterValue] => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value }));
}

const KEY = '/api/media-queries';

async function fetchQueries(url: string): Promise<MediaQueryRecord[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch media queries');
  const json = (await res.json()) as { data: MediaQueryRecord[] };
  return json.data;
}

async function createQuery(
  _key: string,
  { arg }: { arg: { name: string; contentType: ContentType; filterValues: FilterValueEntry[] } }
): Promise<MediaQueryRecord> {
  const res = await fetch(KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error('Failed to save query');
  const json = (await res.json()) as { data: MediaQueryRecord };
  return json.data;
}

async function deleteQuery(_key: string, { arg }: { arg: number }): Promise<void> {
  const res = await fetch(`${KEY}/${arg}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete query');
}

export function useMediaQueries() {
  const { data: queries = [], isLoading, mutate } = useSWR(KEY, fetchQueries);

  const { trigger: triggerCreate } = useSWRMutation(KEY, createQuery);
  const { trigger: triggerDelete } = useSWRMutation(KEY, deleteQuery);

  const save = async (
    name: string,
    contentType: ContentType,
    filterValues: FilterValueEntry[]
  ): Promise<MediaQueryRecord> => {
    const q = await triggerCreate({ name, contentType, filterValues });
    await mutate();
    return q!;
  };

  const remove = async (id: number): Promise<void> => {
    await triggerDelete(id);
    await mutate();
  };

  return { queries, isLoading, save, remove };
}
