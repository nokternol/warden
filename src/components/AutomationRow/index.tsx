import ConnectionTestIcon from '@app/components/ConnectionTestIcon';
import StatusDot from '@app/components/StatusDot';
import type { AutomationDto } from '@app/hooks/useAutomations';
import { cn } from '@app/lib/utils/cn';
import { relativeTime, safeHumanSchedule } from '@app/lib/utils/time';
import { Pause, Play, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';

const RUN_FEEDBACK_DISMISS_MS = 2000;

type RunStatus = 'idle' | 'loading' | 'pass' | 'fail';

export default function AutomationRow({
  automation,
  onToggle,
  onDelete,
  onRun,
}: {
  automation: AutomationDto;
  onToggle: () => void;
  onDelete: () => void;
  onRun?: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  // System automations are invariants: they can only be run on demand. The schedule toggle and
  // delete (both forbidden by the API for kind=system) are user-automation controls only.
  const isUserAutomation = automation.kind !== 'system';
  const nextRunLabel = automation.nextRun ? relativeTime(automation.nextRun) : null;
  const lastRunLabel = automation.lastRun ? relativeTime(automation.lastRun.at) : null;

  const handleRun = async () => {
    if (!onRun || runStatus === 'loading') return;
    setRunStatus('loading');
    try {
      await onRun();
      setRunStatus('pass');
    } catch {
      setRunStatus('fail');
    } finally {
      setTimeout(() => setRunStatus('idle'), RUN_FEEDBACK_DISMISS_MS);
    }
  };

  const runTitle =
    runStatus === 'loading'
      ? 'Triggering run…'
      : runStatus === 'pass'
        ? 'Run triggered'
        : runStatus === 'fail'
          ? 'Run failed — click to retry'
          : 'Run now';

  return (
    <div className="block sm:grid sm:grid-cols-[1fr_160px_168px_88px] sm:items-start px-4 py-3 border-b border-border last:border-0 group hover:bg-surface-bg/40 transition-colors duration-150">
      {/* Name + query · task */}
      <div className="min-w-0 sm:pr-4">
        <div className="flex items-start gap-2">
          <StatusDot status={automation.status} />
          <span className="text-sm font-medium text-text-primary leading-5">{automation.name}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 pl-[18px] text-xs text-text-muted min-w-0">
          <span className="truncate">{automation.query?.name ?? '—'}</span>
          <span className="opacity-40 flex-shrink-0">·</span>
          <span className="truncate">{automation.provider?.name ?? '—'}</span>
          <span className="opacity-40 flex-shrink-0">·</span>
          <span className="truncate">{automation.taskId}</span>
        </div>
        {/* Mobile meta */}
        <div className="sm:hidden mt-1.5 pl-[18px] flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted">
          <span className="font-mono">{safeHumanSchedule(automation.schedule)}</span>
          {lastRunLabel && (
            <>
              <span className="opacity-40">·</span>
              <span>{lastRunLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="hidden sm:block text-xs text-text-secondary font-mono leading-5 pt-0.5">
        {safeHumanSchedule(automation.schedule)}
      </div>

      {/* Last run */}
      <div className="hidden sm:block pt-0.5">
        {automation.lastRun ? (
          <>
            <p className="text-sm text-text-secondary leading-5">{lastRunLabel}</p>
            {(automation.lastRun.itemCount ?? 0) > 0 && (
              <p className="text-xs text-text-muted mt-0.5">{automation.lastRun.itemCount} items</p>
            )}
          </>
        ) : (
          <span className="text-xs text-text-muted">Never run</span>
        )}
      </div>

      {/* Next run + actions */}
      <div className="hidden sm:flex items-start justify-between gap-2 pt-0.5">
        <span className="text-sm text-text-muted">
          {automation.status === 'disabled' ? '—' : (nextRunLabel ?? '—')}
        </span>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void onDelete();
              }}
              className="px-2 py-0.5 text-[11px] font-medium rounded-sm bg-danger text-white hover:bg-danger-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-0.5 text-[11px] rounded-sm bg-surface-panel border border-border text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div
            className={cn(
              'flex items-center gap-1 transition-opacity',
              runStatus === 'idle'
                ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                : 'opacity-100'
            )}
          >
            {onRun && (
              <button
                type="button"
                onClick={() => {
                  void handleRun();
                }}
                disabled={runStatus === 'loading'}
                title={runTitle}
                aria-live="polite"
                className={cn(
                  'w-6 h-6 flex items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed',
                  runStatus === 'idle' &&
                    'text-text-muted hover:text-primary hover:bg-surface-elevated',
                  runStatus === 'fail' && 'text-danger hover:bg-danger/10'
                )}
              >
                {runStatus === 'idle' ? (
                  <Zap size={12} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <ConnectionTestIcon
                    status={
                      runStatus === 'loading' ? 'loading' : runStatus === 'pass' ? 'pass' : 'fail'
                    }
                  />
                )}
              </button>
            )}
            {isUserAutomation && (
              <>
                <button
                  type="button"
                  onClick={onToggle}
                  title={automation.status === 'active' ? 'Pause' : 'Resume'}
                  className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  {automation.status === 'active' ? (
                    <Pause size={12} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Play size={12} strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  title="Delete automation"
                  className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
                >
                  <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
