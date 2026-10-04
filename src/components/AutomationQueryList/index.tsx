import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { AutomationQueryInput } from '@contract/automations';
import useSWR from 'swr';

/** An automation query as the list edits it: always in a known position. */
export type AutomationQueryItem = Required<AutomationQueryInput>;

export interface AutomationQueryListProps {
  automationQueries: AutomationQueryItem[];
  queries: { id: number; name: string }[];
  onChange: (automationQueries: AutomationQueryItem[]) => void;
}

function usePreviewCount(queryId: number): number | null {
  const { data } = useApi(api.mediaQueries.preview, queryId > 0 ? { id: queryId } : null);
  return data?.count ?? null;
}

function AutomationQueryRow({
  automationQuery,
  index,
  automationQueries,
  onChange,
}: {
  automationQuery: AutomationQueryItem;
  index: number;
  automationQueries: AutomationQueryItem[];
  onChange: (next: AutomationQueryItem[]) => void;
}) {
  const count = usePreviewCount(automationQuery.queryId);

  function handleRemove() {
    onChange(automationQueries.filter((_, i) => i !== index));
  }

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const updated = automationQueries.map((s, j) =>
      j === index ? { ...s, role: e.target.value as AutomationQueryItem['role'] } : s
    );
    onChange(updated);
  }

  const countLabel =
    count != null
      ? automationQuery.role === 'include'
        ? `${count} matched`
        : `${count} excluded`
      : null;

  return (
    <div>
      <span>{automationQuery.queryId}</span>
      <select value={automationQuery.role} onChange={handleRoleChange}>
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
  automationQueries: AutomationQueryItem[]
): Promise<{ role: AutomationQueryItem['role']; count: number }[]> {
  return Promise.all(
    automationQueries.map(async (s) => {
      if (s.queryId === 0) return { role: s.role, count: 0 };
      const { count } = await api.mediaQueries.preview({ id: s.queryId });
      return { role: s.role, count };
    })
  );
}

function useNetCount(automationQueries: AutomationQueryItem[]): number | null {
  const key =
    automationQueries.length > 0 && automationQueries.some((s) => s.role === 'exclude')
      ? `preview:${automationQueries.map((s) => `${s.queryId}:${s.role}`).join(',')}`
      : null;
  const { data } = useSWR(key, () => fetchAllPreviews(automationQueries));
  if (!data) return null;
  const includeTotal = data.filter((d) => d.role === 'include').reduce((s, d) => s + d.count, 0);
  const excludeTotal = data.filter((d) => d.role === 'exclude').reduce((s, d) => s + d.count, 0);
  return Math.max(0, includeTotal - excludeTotal);
}

export default function AutomationQueryList({
  automationQueries,
  queries: _queries,
  onChange,
}: AutomationQueryListProps) {
  function handleAdd() {
    onChange([
      ...automationQueries,
      { queryId: 0, role: 'include', sortOrder: automationQueries.length },
    ]);
  }

  const excludeCount = automationQueries.filter((s) => s.role === 'exclude').length;
  const hasValidInclude = automationQueries.some((s) => s.role === 'include' && s.queryId > 0);
  const net = useNetCount(automationQueries);

  return (
    <div>
      {automationQueries.map((automationQuery, i) => (
        <AutomationQueryRow
          key={automationQuery.sortOrder}
          automationQuery={automationQuery}
          index={i}
          automationQueries={automationQueries}
          onChange={onChange}
        />
      ))}
      {net != null && <p>~{net} to act on</p>}
      {!hasValidInclude && automationQueries.length > 0 && (
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
