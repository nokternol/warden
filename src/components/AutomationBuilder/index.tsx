import AutomationQueryList from '@app/components/AutomationQueryList';
import type { AutomationQueryItem } from '@app/components/AutomationQueryList';
import Badge from '@app/components/Badge';
import type { CreateAutomationInput } from '@app/hooks/useAutomations';
import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { useProviderSettings } from '@app/hooks/useProviderSettings';
import { optionsForProvider, useProviderTaskOptions } from '@app/hooks/useProviderTaskOptions';
import type { ProviderTaskParameter } from '@app/hooks/useProviderTasks';
import { useProviderTasks } from '@app/hooks/useProviderTasks';
import { cn } from '@app/lib/utils/cn';
import { Cron } from 'croner';
import cronstrue from 'cronstrue';
import { Clock, TriangleAlert, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Schedule presets ─────────────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily 2am', value: '0 2 * * *' },
  { label: 'Weekly', value: '0 2 * * 0' },
  { label: 'Monthly', value: '0 2 1 * *' },
];

function safeHumanSchedule(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: true });
  } catch {
    return 'Invalid cron expression';
  }
}

function safeNextRun(cron: string): Date | null {
  try {
    const job = new Cron(cron, { paused: true });
    const next = job.nextRun();
    job.stop();
    return next;
  } catch {
    return null;
  }
}

function relativeTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  if (abs < 60_000) return past ? 'just now' : 'in <1m';
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000);
    return past ? `${m}m ago` : `in ${m}m`;
  }
  if (abs < 86_400_000) {
    const h = Math.round(abs / 3_600_000);
    return past ? `${h}h ago` : `in ${h}h`;
  }
  const d = Math.round(abs / 86_400_000);
  return past ? `${d}d ago` : `in ${d}d`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BuilderTask {
  taskId: string;
  label: string;
  destructive: boolean;
  providerId: number;
  providerName: string;
  providerType: string;
  parameter?: ProviderTaskParameter;
}

function SettingsLink() {
  return (
    <a
      href="/settings"
      className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
    >
      Settings
    </a>
  );
}

// ─── AutomationBuilder ────────────────────────────────────────────────────────

export default function AutomationBuilder({
  queries,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  queries: MediaQueryRecord[];
  onSubmit: (input: CreateAutomationInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { providers } = useProviderSettings();
  const { availability } = useProviderTasks();

  // The server owns the task catalogue: each configured actuator instance
  // declares its tasks with a per-instance `enabled` flag. The builder offers
  // only enabled tasks of active providers, joining the instance's display name
  // from settings (the availability endpoint is keyed by id + type only).
  const availableTasks = useMemo<BuilderTask[]>(() => {
    if (!providers || !availability) return [];
    return availability.flatMap((instance) => {
      const provider = providers.find((p) => p.id === instance.providerId);
      if (!provider || !provider.isActive) return [];
      return instance.tasks
        .filter((t) => t.enabled)
        .map((t) => ({
          taskId: t.id,
          label: t.label,
          destructive: t.destructive,
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.type,
          parameter: t.parameter,
        }));
    });
  }, [providers, availability]);

  const tasksByProvider = useMemo(() => {
    const groups = new Map<
      number,
      { providerName: string; providerType: string; tasks: BuilderTask[] }
    >();
    for (const t of availableTasks) {
      if (!groups.has(t.providerId)) {
        groups.set(t.providerId, {
          providerName: t.providerName,
          providerType: t.providerType,
          tasks: [],
        });
      }
      groups.get(t.providerId)!.tasks.push(t);
    }
    return Array.from(groups.entries());
  }, [availableTasks]);

  const [name, setName] = useState('');
  const [automationQueries, setAutomationQueries] = useState<AutomationQueryItem[]>(
    queries.length === 1 ? [{ queryId: queries[0].id, role: 'include', sortOrder: 0 }] : []
  );
  const [selectedTask, setSelectedTask] = useState<BuilderTask | null>(null);
  const [taskParameterValue, setTaskParameterValue] = useState('');

  const selectParameter =
    selectedTask?.parameter?.type === 'select' ? selectedTask.parameter : undefined;
  const { availability: taskOptionsAvailability } = useProviderTaskOptions(
    selectParameter?.optionsRoute
  );
  const taskParameterOptions = selectedTask
    ? optionsForProvider(taskOptionsAvailability, selectedTask.providerId)
    : [];
  const [schedulePreset, setSchedulePreset] = useState(SCHEDULE_PRESETS[1].value);
  const [customSchedule, setCustomSchedule] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const effectiveCron = isCustom ? customSchedule : schedulePreset;
  const humanSchedule = effectiveCron ? safeHumanSchedule(effectiveCron) : '';
  const nextRunDate = effectiveCron ? safeNextRun(effectiveCron) : null;
  const isValidCron = nextRunDate !== null;

  const hasValidInclude = automationQueries.some((s) => s.role === 'include' && s.queryId > 0);

  const hasRequiredParameter = !selectedTask?.parameter || taskParameterValue.trim().length > 0;

  const canSubmit =
    name.trim().length > 0 &&
    hasValidInclude &&
    selectedTask !== null &&
    isValidCron &&
    hasRequiredParameter;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !selectedTask) return;
      setSubmitError(null);
      onSubmit({
        name: name.trim(),
        queries: automationQueries,
        providerId: selectedTask.providerId,
        taskId: selectedTask.taskId,
        taskParameter: selectedTask.parameter ? taskParameterValue : undefined,
        schedule: effectiveCron,
      });
    },
    [canSubmit, automationQueries, selectedTask, name, effectiveCron, taskParameterValue, onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-primary/30 bg-surface-panel"
      noValidate
    >
      {/* Form header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
        <span className="text-sm font-semibold text-text-primary">New automation</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
        >
          Cancel
        </button>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* ── Name ── */}
        <div>
          <label
            htmlFor="auto-name"
            className="block text-xs font-medium text-text-secondary mb-1.5"
          >
            Name
          </label>
          <input
            ref={nameRef}
            id="auto-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Archive stale movies"
            className="w-full max-w-md px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary placeholder:text-text-muted/60 focus:border-primary focus:outline-none transition-colors"
            required
          />
        </div>

        {/* ── Automation queries ── */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">Run on</p>
          <p className="text-xs text-text-muted mb-3">Which media this automation targets.</p>
          <AutomationQueryList
            automationQueries={automationQueries}
            queries={queries.map((q) => ({ id: q.id, name: q.name }))}
            onChange={setAutomationQueries}
          />
        </div>

        {/* ── Task ── */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">Task</p>
          <p className="text-xs text-text-muted mb-3">What to do with matched items.</p>
          {tasksByProvider.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-6 rounded border border-dashed border-border bg-surface-bg/40 text-center">
              <Zap size={18} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
              <p className="text-sm font-medium text-text-secondary">No tasks are enabled yet</p>
              <p className="max-w-xs text-xs text-text-muted">
                Enable tasks on a connected provider in <SettingsLink /> to use them here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasksByProvider.map(([providerId, group]) => (
                <div key={providerId} className="rounded border border-border overflow-hidden">
                  <div className="px-3 py-1.5 bg-surface-bg/60 border-b border-border/60">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                      {group.providerName}
                      <span className="ml-1.5 normal-case tracking-normal font-normal opacity-60">
                        {group.providerType}
                      </span>
                    </span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {group.tasks.map((bt: BuilderTask) => {
                      const selected =
                        selectedTask?.taskId === bt.taskId &&
                        selectedTask?.providerId === bt.providerId;
                      return (
                        <label
                          key={`${bt.providerId}-${bt.taskId}`}
                          className={cn(
                            'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors',
                            selected ? 'bg-primary/15' : 'bg-surface-panel hover:bg-surface-bg/40'
                          )}
                        >
                          <input
                            type="radio"
                            name="task"
                            checked={selected}
                            onChange={() => {
                              setSelectedTask(bt);
                              setTaskParameterValue('');
                            }}
                            className="flex-shrink-0 text-primary focus:ring-primary focus:ring-offset-0"
                          />
                          <div className="flex flex-1 min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium truncate',
                                selected ? 'text-primary' : 'text-text-primary'
                              )}
                            >
                              {bt.label}
                            </span>
                            {bt.destructive && (
                              <Badge
                                variant="warning"
                                size="sm"
                                className="gap-1 shrink-0"
                                aria-label="Destructive action"
                              >
                                <TriangleAlert size={11} strokeWidth={2} aria-hidden="true" />
                                Destructive
                              </Badge>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Task parameter ── */}
        {selectParameter && (
          <div>
            <label
              htmlFor="task-parameter"
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              {selectParameter.label}
            </label>
            <select
              id="task-parameter"
              value={taskParameterValue}
              onChange={(e) => setTaskParameterValue(e.target.value)}
              className="w-full max-w-md px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
              required
            >
              <option value="" disabled>
                Select {selectParameter.label.toLowerCase()}…
              </option>
              {taskParameterOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── Schedule ── */}
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1">Schedule</p>
          <p className="text-xs text-text-muted mb-3">When this automation runs.</p>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setSchedulePreset(p.value);
                  setIsCustom(false);
                }}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel',
                  !isCustom && schedulePreset === p.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-bg'
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCustom(true)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel',
                isCustom
                  ? 'bg-primary text-white'
                  : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-bg'
              )}
            >
              Custom
            </button>
          </div>

          {/* Custom cron input */}
          {isCustom && (
            <div className="mb-2.5">
              <input
                type="text"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                placeholder="e.g. 0 3 * * 1-5"
                className={cn(
                  'w-48 px-3 py-1.5 text-sm font-mono bg-surface-bg border rounded text-text-primary focus:outline-none transition-colors',
                  !isValidCron && customSchedule
                    ? 'border-danger'
                    : 'border-border focus:border-primary'
                )}
              />
            </div>
          )}

          {/* Schedule description */}
          {effectiveCron && (
            <div
              className={cn(
                'flex items-center gap-2 text-xs',
                isValidCron ? 'text-text-secondary' : 'text-danger'
              )}
            >
              <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
              <span>
                {isValidCron
                  ? `${humanSchedule} · next ${relativeTime(nextRunDate!)}`
                  : humanSchedule}
              </span>
            </div>
          )}
        </div>

        {/* ── Submit ── */}
        {submitError && <p className="text-xs text-danger">{submitError}</p>}

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-sm bg-surface-elevated border border-border text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-sm text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel',
              canSubmit && !isSubmitting
                ? 'bg-primary hover:bg-primary-hover'
                : 'bg-primary/40 cursor-not-allowed'
            )}
          >
            {isSubmitting ? 'Creating…' : 'Create automation'}
          </button>
        </div>
      </div>
    </form>
  );
}
