import { LoadError, SkeletonRows } from '@app/components/AsyncBoundary';
import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import { rowTableStyles as table } from '@app/components/RowTable';
import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { type RunItemDto, useRunItems } from '@app/hooks/useRunItems';
import { RUN_STATUS } from '@app/lib/runStatus';
import { cn } from '@app/lib/utils/cn';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import styles from './RunRow.module.css';

/** The run table's columns, in order — the header and every row's cells follow it. */
export const RUN_COLUMNS = ['Automation', 'Status', 'Ran at', 'Items', 'Details'].map((label) => ({
  label,
}));

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

export interface RunRowProps {
  run: AutomationRunDto;
  /** Whether the row starts with its targeted titles shown; the toggle still works. */
  defaultExpanded?: boolean;
}

/** One run in the Runs table; expands to the titles the run targeted. */
function Root({ run, defaultExpanded = false }: RunRowProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const targetedAny = (run.itemCount ?? 0) > 0;

  return (
    <>
      <tr className={table.row}>
        <td className={table.nameCell}>
          <div className={styles.name}>
            {targetedAny ? (
              <ExpandToggle open={open} onToggle={() => setOpen(!open)} />
            ) : (
              <span className={styles.togglePlaceholder} aria-hidden />
            )}
            {run.automationName}
          </div>
        </td>
        <td className={table.cell} data-label="Status">
          <Badge variant={RUN_STATUS[run.status].variant} size="sm">
            {RUN_STATUS[run.status].label}
          </Badge>
        </td>
        <td className={table.cell} data-label="Ran at">
          {formatDate(run.ranAt)}
        </td>
        <td className={table.cell} data-label="Items">
          {run.itemCount !== null ? run.itemCount : '—'}
        </td>
        <td className={table.blockCell}>
          <span className={run.status === 'error' ? styles.error : undefined}>
            {run.error ?? <span className="max-lg:hidden">—</span>}
          </span>
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
      className={styles.toggle}
    >
      <ChevronRight className={cn(styles.chevron, open && styles.chevronOpen)} aria-hidden />
    </button>
  );
}

/** The detail row listing a run's targeted titles. */
function TargetedItems({ runId }: { runId: number }) {
  return (
    <tr className={cn(table.detailRow, styles.itemsRow)}>
      <td colSpan={RUN_COLUMNS.length} className={cn(table.detailCell, styles.itemsCell)}>
        <TargetedItemList runId={runId} />
      </td>
    </tr>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

function TargetedItemList({ runId }: { runId: number }) {
  const { items, total, error, refresh, isFetchingMore, loadMore } = useRunItems(runId);

  if (!items) {
    return error ? (
      <LoadError what="this run's items" onRetry={() => refresh()} />
    ) : (
      <SkeletonRows count={2} />
    );
  }
  if (items.length === 0) return <Note>No items recorded for this run.</Note>;

  return (
    <>
      <ul className={styles.itemList}>
        {items.map((item) => (
          <TargetedItem key={item.id} item={item} />
        ))}
      </ul>
      {total > items.length && (
        <div className={styles.pageNote}>
          <span>
            Showing {items.length} of {total} items
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isFetchingMore}
            onClick={() => {
              void loadMore();
            }}
          >
            Show more items
          </Button>
        </div>
      )}
      {error && <LoadError what="more items" onRetry={() => refresh()} />}
    </>
  );
}

function TargetedItem({ item }: { item: RunItemDto }) {
  return (
    <li className={cn(styles.item, item.deleted && styles.itemRemoved)}>
      <span className={cn(styles.itemTitle, item.deleted && styles.itemTitleRemoved)}>
        {item.title ?? 'Untitled'}
      </span>
      {item.year !== null && <span className={styles.itemYear}>{item.year}</span>}
      {item.deleted && (
        <Badge variant="default" size="sm" title="This item has since left its source">
          Removed
        </Badge>
      )}
    </li>
  );
}

const RunRow = Root;

export default RunRow;
