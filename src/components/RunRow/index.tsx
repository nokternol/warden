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

  return (
    <>
      <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? 'Hide items' : 'Show items'}
              title={open ? 'Hide items' : 'Show items'}
              onClick={() => setOpen(!open)}
              className="p-1 -ml-1 rounded text-[var(--color-text-secondary)] hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronRight
                className={cn('w-4 h-4 transition-transform', open && 'rotate-90')}
                aria-hidden
              />
            </button>
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

/** The detail row listing a run's targeted titles. */
function TargetedItems({ runId }: { runId: number }) {
  const { items, total, isLoading } = useRunItems(runId);

  return (
    <tr className="border-b border-white/5 bg-white/[0.015]">
      <td colSpan={COLUMN_COUNT} className="px-4 pt-1 pb-4 pl-11">
        {isLoading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading items…</p>
        ) : (
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
        )}
      </td>
    </tr>
  );
}

function TargetedItem({ item }: { item: RunItemDto }) {
  return (
    <li
      className={cn(
        'flex items-center gap-1.5 text-sm min-w-0',
        item.deleted ? 'text-[var(--color-text-secondary)]' : 'text-white'
      )}
    >
      <span className={cn('truncate', item.deleted && 'line-through decoration-white/30')}>
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
