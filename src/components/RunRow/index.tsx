import Badge from '@app/components/Badge';
import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { type RunItemDto, useRunItems } from '@app/hooks/useRunItems';
import { cn } from '@app/lib/utils/cn';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import styles from './RunRow.module.css';

/** The run table's columns, in order — the header and every row's cells follow it. */
const COLUMNS = ['Automation', 'Status', 'Ran At', 'Items', 'Error'] as const;

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
      <tr className={styles.row}>
        <td className={styles.nameCell}>
          <div className={styles.name}>
            {targetedAny ? (
              <ExpandToggle open={open} onToggle={() => setOpen(!open)} />
            ) : (
              <span className={styles.togglePlaceholder} aria-hidden />
            )}
            {run.automationName}
          </div>
        </td>
        <td className={styles.badgeCell}>
          <Badge variant={run.status === 'success' ? 'success' : 'error'} size="sm">
            {run.status}
          </Badge>
        </td>
        <td className={styles.cell}>{formatDate(run.ranAt)}</td>
        <td className={styles.cell}>{run.itemCount !== null ? run.itemCount : '—'}</td>
        <td className={cn(styles.cell, styles.errorCell)}>
          {run.error ? (
            <span className={styles.error} title={run.error}>
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
      className={styles.toggle}
    >
      <ChevronRight className={cn(styles.chevron, open && styles.chevronOpen)} aria-hidden />
    </button>
  );
}

/** The detail row listing a run's targeted titles. */
function TargetedItems({ runId }: { runId: number }) {
  return (
    <tr className={styles.detailRow}>
      <td colSpan={COLUMNS.length} className={styles.detailCell}>
        <TargetedItemList runId={runId} />
      </td>
    </tr>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

function TargetedItemList({ runId }: { runId: number }) {
  const { items, total, isLoading } = useRunItems(runId);

  if (isLoading) return <Note>Loading items…</Note>;
  if (items.length === 0) return <Note>No items recorded for this run.</Note>;

  return (
    <>
      <ul className={styles.itemList}>
        {items.map((item) => (
          <TargetedItem key={item.mediaItemId} item={item} />
        ))}
      </ul>
      {total > items.length && (
        <p className={styles.pageNote}>
          Showing {items.length} of {total} items
        </p>
      )}
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
          removed
        </Badge>
      )}
    </li>
  );
}

/** The run table's header row, naming the columns each `RunRow` fills. */
function Head() {
  return (
    <thead>
      <tr className={styles.headRow}>
        {COLUMNS.map((column) => (
          <th key={column} className={styles.columnHeader}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

const RunRow = Object.assign(Root, { Head });

export default RunRow;
