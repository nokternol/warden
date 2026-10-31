import Button from '@app/components/Button';
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
  options,
  onPatch,
  onRemove,
}: {
  automationQuery: AutomationQueryItem;
  index: number;
  /** The queries this row can hold: its own, plus any no other row holds. */
  options: { id: number; name: string }[];
  onPatch: (patch: Partial<AutomationQueryItem>) => void;
  onRemove: () => void;
}) {
  const count = usePreviewCount(automationQuery.queryId);
  const position = index + 1;

  const countLabel =
    count != null
      ? automationQuery.role === 'include'
        ? `${count} matched`
        : `${count} excluded`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Query ${position}`}
        value={automationQuery.queryId}
        onChange={(e) => onPatch({ queryId: Number(e.target.value) })}
        className="field flex-1 min-w-48 sm:max-w-xs"
      >
        {options.map((query) => (
          <option key={query.id} value={query.id}>
            {query.name}
          </option>
        ))}
      </select>
      <select
        aria-label={`Role of query ${position}`}
        value={automationQuery.role}
        onChange={(e) => onPatch({ role: e.target.value as AutomationQueryItem['role'] })}
        className="field w-auto"
      >
        <option value="include">Include</option>
        <option value="exclude">Exclude</option>
      </select>
      {countLabel && <span className="text-xs text-text-muted tabular-nums">{countLabel}</span>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`Remove query ${position}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

async function fetchAllPreviews(
  automationQueries: AutomationQueryItem[]
): Promise<{ role: AutomationQueryItem['role']; count: number }[]> {
  return Promise.all(
    automationQueries.map(async (s) => {
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
  queries,
  onChange,
}: AutomationQueryListProps) {
  const heldIds = new Set(automationQueries.map((s) => s.queryId));
  const firstUnused = queries.find((query) => !heldIds.has(query.id));

  function handleAdd() {
    if (!firstUnused) return;
    const nextOrder = Math.max(-1, ...automationQueries.map((s) => s.sortOrder)) + 1;
    onChange([
      ...automationQueries,
      { queryId: firstUnused.id, role: 'include', sortOrder: nextOrder },
    ]);
  }

  const excludeCount = automationQueries.filter((s) => s.role === 'exclude').length;
  const hasInclude = automationQueries.some((s) => s.role === 'include');
  const net = useNetCount(automationQueries);

  return (
    <div className="space-y-2">
      {automationQueries.map((automationQuery, i) => (
        <AutomationQueryRow
          key={automationQuery.sortOrder}
          automationQuery={automationQuery}
          index={i}
          options={queries.filter(
            (query) => query.id === automationQuery.queryId || !heldIds.has(query.id)
          )}
          onPatch={(patch) =>
            onChange(automationQueries.map((s, j) => (j === i ? { ...s, ...patch } : s)))
          }
          onRemove={() => onChange(automationQueries.filter((_, j) => j !== i))}
        />
      ))}
      {net != null && <p className="text-xs text-text-secondary">~{net} to act on</p>}
      {!hasInclude && automationQueries.length > 0 && (
        <p className="text-xs text-text-secondary">At least one query must be included.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!firstUnused}
          onClick={handleAdd}
        >
          Add query
        </Button>
        <p className="text-xs text-text-muted">
          Include adds a query's matches. Exclude removes its matches from the result.
        </p>
      </div>
      {excludeCount > 2 && (
        <p className="text-xs text-text-secondary">
          Complex exclusion rules can be hard to reason about. Consider simplifying.
        </p>
      )}
    </div>
  );
}
