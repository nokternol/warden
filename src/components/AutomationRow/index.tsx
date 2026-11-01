import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import ConnectionTestIcon from '@app/components/ConnectionTestIcon';
import StatusDot from '@app/components/StatusDot';
import { useAutomationPreview } from '@app/hooks/useAutomationPreview';
import { useLatestRun } from '@app/hooks/useAutomationRuns';
import type { AutomationDto } from '@app/hooks/useAutomations';
import { tasksForProvider, useProviderTasks } from '@app/hooks/useProviderTasks';
import { blastRadius } from '@app/lib/blastRadius';
import { RUN_STATUS } from '@app/lib/runStatus';
import { cn } from '@app/lib/utils/cn';
import { relativeTime, safeHumanSchedule } from '@app/lib/utils/time';
import { Power, PowerOff, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';

const RUN_FEEDBACK_DISMISS_MS = 2000;
const GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_140px_180px_72px_112px] lg:gap-x-3';
const ICON_BUTTON =
  'size-11 lg:size-8 flex items-center justify-center rounded text-text-muted transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed';

type RunStatus = 'idle' | 'loading' | 'pass' | 'fail';

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The header naming the columns every row fills; rows label their own cells below `lg`. */
function Head() {
  return (
    <div
      className={cn(GRID, 'hidden lg:grid items-center px-4 py-2 border-b border-divider')}
      aria-hidden="true"
    >
      {['Automation', 'Schedule', 'Last run', 'Next run'].map((column) => (
        <span key={column} className="text-xs font-medium text-text-muted">
          {column}
        </span>
      ))}
    </div>
  );
}

function CellLabel({ children }: { children: string }) {
  return <span className="lg:hidden text-text-muted">{children} </span>;
}

/** The last attempt's outcome, its reason in full, and the way to that automation's runs. */
function LastRun({ automation }: { automation: AutomationDto }) {
  const latest = useLatestRun(automation.id);
  // A skip leaves the last-run summary alone, so the newest recorded run is what can show one.
  const skipped = latest?.status === 'skipped' ? latest : undefined;
  const outcome = skipped?.status ?? automation.lastRun?.status;
  const at = skipped?.ranAt ?? automation.lastRun?.at;
  const reason = skipped?.error ?? automation.lastRun?.error;
  const itemCount = skipped ? 0 : (automation.lastRun?.itemCount ?? 0);

  if (!outcome || !at) return <span className="text-xs text-text-muted">Never run</span>;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant={RUN_STATUS[outcome].variant} size="sm">
          {RUN_STATUS[outcome].label}
        </Badge>
        <span className="text-xs text-text-secondary whitespace-nowrap">{relativeTime(at)}</span>
      </div>
      {reason && (
        <p
          className={cn(
            'text-xs break-words',
            outcome === 'error' ? 'text-danger-text' : 'text-text-secondary'
          )}
        >
          {reason}
        </p>
      )}
      <p className="text-xs text-text-muted">
        {itemCount > 0 && `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · `}
        <a
          href={`/runs?automationId=${automation.id}`}
          aria-label={`Runs of ${automation.name}`}
          className="underline underline-offset-2 hover:text-text-primary inline-flex items-center max-lg:min-h-[44px]"
        >
          Runs
        </a>
      </p>
    </div>
  );
}

/** Stops a destructive Run Now until the number it will affect is known and accepted. */
function RunConfirmation({
  automation,
  taskLabel,
  onConfirm,
  onCancel,
}: {
  automation: AutomationDto;
  taskLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const preview = useAutomationPreview(
    automation.provider
      ? {
          providerId: automation.provider.id,
          taskId: automation.taskId,
          queries: automation.queries.map(({ queryId, role }) => ({ queryId, role })),
        }
      : null
  );
  const radius = blastRadius(preview);

  return (
    <div className="mt-3 lg:col-span-full rounded border border-warning/40 bg-warning/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-text-primary">
        {radius.state === 'counted' ? `${taskLabel} ${radius.phrase}.` : radius.phrase}
      </p>
      <div className="flex gap-2">
        {radius.state === 'failed' && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void preview.mutate();
            }}
          >
            Retry count
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={radius.state !== 'counted'}
          onClick={onConfirm}
        >
          Run now
        </Button>
      </div>
    </div>
  );
}

/**
 * One automation: what it does, when, how its last run went and what can be done to it. System
 * automations can only be run on demand, so they omit `onToggle` and `onDelete`.
 */
function Root({
  automation,
  onToggle,
  onDelete,
  onRun,
}: {
  automation: AutomationDto;
  onToggle?: () => unknown;
  onDelete?: () => unknown;
  onRun?: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<'delete' | 'run' | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { name, kind, status } = automation;
  const isUserAutomation = kind !== 'system';

  const { availability, error: tasksError } = useProviderTasks();
  const task =
    automation.provider &&
    tasksForProvider(availability, automation.provider.id).find((t) => t.id === automation.taskId);
  // Until the task catalogue answers, a user automation might be destructive, so it cannot run yet.
  const tasksKnown = !isUserAutomation || availability !== undefined || Boolean(tasksError);
  // A task the catalogue no longer describes could still be destructive, so it confirms too.
  const needsRunConfirmation = isUserAutomation && (task?.destructive ?? true);
  const taskLabel = task?.label ?? 'Task no longer offered';
  const extraQueries = automation.queries.length - 1;

  const run = async () => {
    if (!onRun || runStatus === 'loading') return;
    setConfirming(null);
    setRunStatus('loading');
    setActionError(null);
    try {
      await onRun();
      setRunStatus('pass');
      setTimeout(() => setRunStatus('idle'), RUN_FEEDBACK_DISMISS_MS);
    } catch (err) {
      setRunStatus('fail');
      setActionError(message(err, "Couldn't start the run."));
    }
  };

  const act = async (action: () => unknown, fallback: string) => {
    setPending(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(message(err, fallback));
    } finally {
      setPending(false);
    }
  };

  const runTitle =
    runStatus === 'loading'
      ? 'Triggering run…'
      : runStatus === 'pass'
        ? 'Run triggered'
        : runStatus === 'fail'
          ? 'Run failed, click to retry'
          : 'Run now';

  return (
    <div className="px-4 py-3 border-b border-divider last:border-0">
      <div className={cn(GRID, 'space-y-2 lg:space-y-0 lg:items-start')}>
        {/* Name, queries, provider and task */}
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <StatusDot status={status} />
            <span className="text-sm font-medium text-text-primary leading-5 break-words min-w-0">
              {name}
            </span>
            {status === 'disabled' ? (
              <span className="text-xs text-text-muted leading-5">Disabled</span>
            ) : (
              <span className="sr-only">Active</span>
            )}
          </div>
          {isUserAutomation && (
            <p className="mt-0.5 pl-4 text-xs text-text-muted break-words">
              {automation.query?.name ?? 'No query'}
              {extraQueries > 0 && ` +${extraQueries}`}
              {' · '}
              {automation.provider?.name ?? 'No provider'}
              {' · '}
              <span>{taskLabel}</span>
            </p>
          )}
        </div>

        <div className="text-xs text-text-secondary leading-5">
          <CellLabel>Schedule</CellLabel>
          {safeHumanSchedule(automation.schedule)}
        </div>

        <div>
          <LastRun automation={automation} />
        </div>

        <div className="text-xs text-text-secondary leading-5 whitespace-nowrap">
          <CellLabel>Next run</CellLabel>
          {status === 'active' && automation.nextRun ? relativeTime(automation.nextRun) : '—'}
        </div>

        {/* Actions: always visible, because a phone has no hover */}
        <div className="flex items-center gap-1 lg:justify-end">
          {onRun && (
            <button
              type="button"
              onClick={() => {
                if (needsRunConfirmation) setConfirming('run');
                else void run();
              }}
              disabled={runStatus === 'loading' || !tasksKnown}
              title={runTitle}
              aria-label={`Run ${name} now`}
              className={cn(
                ICON_BUTTON,
                runStatus === 'fail'
                  ? 'text-danger-text hover:bg-danger/10'
                  : 'hover:text-text-primary hover:bg-surface-hover'
              )}
            >
              {runStatus === 'idle' ? (
                <Zap size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <ConnectionTestIcon status={runStatus} />
              )}
            </button>
          )}
          {isUserAutomation && onToggle && (
            <button
              type="button"
              onClick={() => {
                void act(onToggle, "Couldn't change the automation's status.");
              }}
              disabled={pending}
              title={status === 'active' ? 'Disable' : 'Enable'}
              aria-label={`${status === 'active' ? 'Disable' : 'Enable'} ${name}`}
              className={cn(ICON_BUTTON, 'hover:text-text-primary hover:bg-surface-hover')}
            >
              {status === 'active' ? (
                <PowerOff size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Power size={16} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          )}
          {isUserAutomation && onDelete && (
            <button
              type="button"
              onClick={() => setConfirming('delete')}
              disabled={pending}
              title="Delete automation"
              aria-label={`Delete ${name}`}
              className={cn(ICON_BUTTON, 'hover:text-danger-text hover:bg-danger/10')}
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {confirming === 'run' && (
        <RunConfirmation
          automation={automation}
          taskLabel={taskLabel}
          onConfirm={() => {
            void run();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === 'delete' && onDelete && (
        <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-primary">Delete {name} and its run history?</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                void act(onDelete, "Couldn't delete the automation.");
              }}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {actionError}
        </p>
      )}
      <span role="status" className="sr-only">
        {runStatus === 'pass' ? `Run of ${name} triggered` : ''}
      </span>
    </div>
  );
}

const AutomationRow = Object.assign(Root, { Head });

export default AutomationRow;
