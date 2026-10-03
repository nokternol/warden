import Badge from '@app/components/Badge';
import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { type RunItemDto, useRunItems } from '@app/hooks/useRunItems';
import { cn } from '@app/lib/utils/cn';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

const COLUMN_COUNT = 5;

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/** One run in the Runs table; expands to the titles the run targeted. */
export default function RunRow({ run }: { run: AutomationRunDto }) {
  const [open, setOpen] = useState(false);
  const targetedAny = (run.itemCount ?? 0) > 0;

  return (
    <>
      <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-text-primary">
          <div className="flex items-center gap-2">
            {targetedAny ? (
              <ExpandToggle open={open} onToggle={() => setOpen(!open)} />
            ) : (
              <span className="w-6 -ml-1 shrink-0" aria-hidden />
            )}
            {run.automationName}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant={run.status === 'success' ? 'success' : 'error'} size="sm">
            {run.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {formatDate(run.ranAt)}
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {run.itemCount !== null ? run.itemCount : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
          {run.error ? (
            <span className="text-red-400" title={run.error}>
              {run.error.length > 60 ? `${run.error.slice(0, 60)}…` : run.error}
            </span>
          ) : (
            '—'
          )}
        </td>
      </tr>
      {open && <TargetedItems runId={run.id} />}
    </>
  );
}

function ExpandToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? 'Hide items' : 'Show items';
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className="p-1 -ml-1 shrink-0 rounded text-[var(--color-text-secondary)] hover:text-text-primary hover:bg-white/5 transition-colors"
    >
      <ChevronRight
        className={cn('w-4 h-4 transition-transform', open && 'rotate-90')}
        aria-hidden
      />
    </button>
  );
}

/** The detail row listing a run's targeted titles. */
function TargetedItems({ runId }: { runId: number }) {
  return (
    <tr className="border-b border-white/5 bg-white/[0.015]">
      <td colSpan={COLUMN_COUNT} className="px-4 pt-1 pb-4 pl-11">
        <TargetedItemList runId={runId} />
      </td>
    </tr>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--color-text-secondary)]">{children}</p>;
}

function TargetedItemList({ runId }: { runId: number }) {
  const { items, total, isLoading } = useRunItems(runId);

  if (isLoading) return <Note>Loading items…</Note>;
  if (items.length === 0) return <Note>No items recorded for this run.</Note>;

  return (
    <>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <TargetedItem key={item.mediaItemId} item={item} />
        ))}
      </ul>
      {total > items.length && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Showing {items.length} of {total} items
        </p>
      )}
    </>
  );
}

function TargetedItem({ item }: { item: RunItemDto }) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 text-sm min-w-0',
        item.deleted ? 'text-[var(--color-text-secondary)]' : 'text-text-primary'
      )}
    >
      <span className={cn('truncate', item.deleted && 'line-through decoration-current')}>
        {item.title ?? 'Untitled'}
      </span>
      {item.year !== null && (
        <span className="text-[var(--color-text-secondary)]">{item.year}</span>
      )}
      {item.deleted && (
        <Badge variant="default" size="sm" title="This item has since left its source">
          removed
        </Badge>
      )}
    </li>
  );
}
