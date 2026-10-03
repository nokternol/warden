import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { QuerySourceInput } from '@contract/automations';
import useSWR from 'swr';

/** A query source as the list edits it: always in a known position. */
export type QuerySource = Required<QuerySourceInput>;

export interface QuerySourceListProps {
  sources: QuerySource[];
  queries: { id: number; name: string }[];
  onChange: (sources: QuerySource[]) => void;
}

function usePreviewCount(queryId: number): number | null {
  const { data } = useApi(api.mediaQueries.preview, queryId > 0 ? { id: queryId } : null);
  return data?.count ?? null;
}

function SourceRow({
  src,
  index,
  sources,
  onChange,
}: {
  src: QuerySource;
  index: number;
  sources: QuerySource[];
  onChange: (s: QuerySource[]) => void;
}) {
  const count = usePreviewCount(src.queryId);

  function handleRemove() {
    onChange(sources.filter((_, i) => i !== index));
  }

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updated = sources.map((s, j) =>
      j === index ? { ...s, role: e.target.value as QuerySource['role'] } : s
    );
    onChange(updated);
  }

  const countLabel =
    count != null ? (src.role === 'include' ? `${count} matched` : `${count} excluded`) : null;

  return (
    <div>
      <span>{src.queryId}</span>
      <select value={src.role} onChange={handleRoleChange}>
        <option value="include">Include</option>
        <option value="exclude">Exclude (unless)</option>
      </select>
      {countLabel && <span>{countLabel}</span>}
      <button type="button" onClick={handleRemove}>
        Remove
      </button>
    </div>
  );
}

async function fetchAllPreviews(
  sources: QuerySource[]
): Promise<{ role: QuerySource['role']; count: number }[]> {
  return Promise.all(
    sources.map(async (s) => {
      if (s.queryId === 0) return { role: s.role, count: 0 };
      const { count } = await api.mediaQueries.preview({ id: s.queryId });
      return { role: s.role, count };
    })
  );
}

function useNetCount(sources: QuerySource[]): number | null {
  const key =
    sources.length > 0 && sources.some((s) => s.role === 'exclude')
      ? `preview:${sources.map((s) => `${s.queryId}:${s.role}`).join(',')}`
      : null;
  const { data } = useSWR(key, () => fetchAllPreviews(sources));
  if (!data) return null;
  const includeTotal = data.filter((d) => d.role === 'include').reduce((s, d) => s + d.count, 0);
  const excludeTotal = data.filter((d) => d.role === 'exclude').reduce((s, d) => s + d.count, 0);
  return Math.max(0, includeTotal - excludeTotal);
}

export default function QuerySourceList({
  sources,
  queries: _queries,
  onChange,
}: QuerySourceListProps) {
  function handleAdd() {
    onChange([...sources, { queryId: 0, role: 'include', sortOrder: sources.length }]);
  }

  const excludeCount = sources.filter((s) => s.role === 'exclude').length;
  const hasValidInclude = sources.some((s) => s.role === 'include' && s.queryId > 0);
  const net = useNetCount(sources);

  return (
    <div>
      {sources.map((src, i) => (
        <SourceRow key={src.sortOrder} src={src} index={i} sources={sources} onChange={onChange} />
      ))}
      {net != null && <p>~{net} to act on</p>}
      {!hasValidInclude && sources.length > 0 && (
        <p>At least one include source with a selected query is required.</p>
      )}
      <button type="button" onClick={handleAdd}>
        Add query
      </button>
      {excludeCount > 2 && (
        <p>Complex exclusion rules can be hard to reason about — consider simplifying.</p>
      )}
    </div>
  );
}
