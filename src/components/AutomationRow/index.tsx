import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import ConnectionTestIcon from '@app/components/ConnectionTestIcon';
import { type RowTableColumn, rowTableStyles as table } from '@app/components/RowTable';
import StatusDot from '@app/components/StatusDot';
import { useAutomationReadiness } from '@app/hooks/useAutomationReadiness';
import { useLatestRun } from '@app/hooks/useAutomationRuns';
import type { AutomationDto } from '@app/hooks/useAutomations';
import { tasksForProvider, useProviderTasks } from '@app/hooks/useProviderTasks';
import { RUN_STATUS } from '@app/lib/runStatus';
import { cn } from '@app/lib/utils/cn';
import { relativeTime, safeHumanSchedule } from '@app/lib/utils/time';
import { Power, PowerOff, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import ReadinessBlocks from './ReadinessBlocks';
import RunCheck from './RunCheck';

const RUN_FEEDBACK_DISMISS_MS = 2000;

export const AUTOMATION_COLUMNS: RowTableColumn[] = [
  { label: 'Automation' },
  { label: 'Schedule', className: 'lg:w-[140px]' },
  { label: 'Last run', className: 'lg:w-[200px]' },
  { label: 'Next run', className: 'lg:w-[96px]' },
  { label: 'Actions', className: 'lg:w-[136px]' },
];

const ICON_BUTTON =
  'size-11 lg:size-8 flex items-center justify-center rounded text-text-muted transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed';

type RunStatus = 'idle' | 'loading' | 'pass' | 'fail';

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

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

/**
 * One automation: what it does, when, how its last run went and what can be done to it. System
 * automations can only be run on demand, so they omit `onToggle` and `onDelete`.
 */
function Root({
  automation,
  onToggle,
  onDelete,
  onRun,
  onSignOff,
}: {
  automation: AutomationDto;
  onToggle?: () => unknown;
  onDelete?: () => unknown;
  /** Starts a Run Now, proceeding past the findings awaiting sign-off it names. */
  onRun?: (consentedFindings?: string[]) => Promise<void>;
  /** Accepts a finding awaiting sign-off as known risk for this automation. */
  onSignOff?: (findingId: string) => Promise<void>;
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
  const readiness = useAutomationReadiness(
    isUserAutomation && automation.provider ? automation.id : null
  );
  // Run Now asks first unless the check has answered that it simply runs.
  const needsRunCheck =
    needsRunConfirmation || (isUserAutomation && readiness.data?.runNow !== 'runs');
  const extraQueries = automation.queries.length - 1;

  const run = async (consentedFindings?: string[]) => {
    if (!onRun || runStatus === 'loading') return;
    setConfirming(null);
    setRunStatus('loading');
    setActionError(null);
    try {
      await onRun(consentedFindings);
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
    <>
      <tr className={table.row}>
        {/* Name, queries, provider and task */}
        <td className={table.nameCell}>
          <div className="flex items-start gap-2 min-w-0">
            <StatusDot status={status} />
            <span className="text-sm font-medium text-text-primary leading-5 break-words min-w-0">
              {name}
            </span>
            {status === 'disabled' ? (
              <span className="text-xs text-text-muted leading-5">Disabled</span>
            ) : (
              <span className="sr-only">Active</span>
            )}
            <span role="status" className="sr-only">
              {runStatus === 'pass' ? `Run of ${name} triggered` : ''}
            </span>
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
        </td>

        <td className={table.cell} data-label="Schedule">
          <span className="text-xs leading-5">{safeHumanSchedule(automation.schedule)}</span>
        </td>

        <td className={table.blockCell}>
          <LastRun automation={automation} />
        </td>

        <td className={table.cell} data-label="Next run">
          <span className="text-xs leading-5 whitespace-nowrap">
            {status === 'active' && automation.nextRun ? relativeTime(automation.nextRun) : '—'}
          </span>
        </td>

        {/* Actions: always visible, because a phone has no hover */}
        <td className={table.blockCell}>
          <div className="flex items-center gap-1 lg:justify-end">
            {onRun && (
              <button
                type="button"
                onClick={() => {
                  if (needsRunCheck) setConfirming('run');
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
        </td>
      </tr>

      {(confirming || actionError || readiness.data) && (
        <tr className={table.detailRow}>
          <td colSpan={AUTOMATION_COLUMNS.length} className={table.detailCell}>
            {readiness.data && (
              <ReadinessBlocks
                readiness={readiness.data}
                onSignOff={
                  onSignOff &&
                  ((findingId) => {
                    void act(async () => {
                      await onSignOff(findingId);
                      await readiness.mutate();
                    }, "Couldn't sign it off.");
                  })
                }
              />
            )}

            {confirming === 'run' && (
              <RunCheck
                readiness={readiness.data}
                failed={Boolean(readiness.error)}
                taskLabel={taskLabel}
                destructive={needsRunConfirmation}
                onConfirm={(consentedFindings) => {
                  void run(consentedFindings).then(() => readiness.mutate());
                }}
                onCancel={() => setConfirming(null)}
                onRetry={() => {
                  void readiness.mutate();
                }}
              />
            )}

            {confirming === 'delete' && onDelete && (
              <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-primary">Delete {name} and its run history?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirming(null)}
                  >
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
          </td>
        </tr>
      )}
    </>
  );
}

export default Root;
