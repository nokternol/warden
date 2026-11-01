import AutomationQueryList from '@app/components/AutomationQueryList';
import type { AutomationQueryItem } from '@app/components/AutomationQueryList';
import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import EmptyState from '@app/components/EmptyState';
import { useAutomationPreview } from '@app/hooks/useAutomationPreview';
import type { CreateAutomationInput } from '@app/hooks/useAutomations';
import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { useProviderSettings } from '@app/hooks/useProviderSettings';
import { optionsForProvider, useProviderTaskOptions } from '@app/hooks/useProviderTaskOptions';
import type { ProviderTaskParameter } from '@app/hooks/useProviderTasks';
import { useProviderTasks } from '@app/hooks/useProviderTasks';
import { blastRadius } from '@app/lib/blastRadius';
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

/**
 * The chosen task with the answers that belong to it: its parameter value and
 * whether its destructive effect is confirmed. Choosing a task starts a fresh
 * selection, so neither answer carries over to a different task.
 */
interface TaskSelection {
  task: BuilderTask;
  parameterValue: string;
  confirmed: boolean;
}

function ScheduleChip({
  label,
  pressed,
  onClick,
}: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm font-medium rounded-sm border transition-colors duration-150 max-sm:min-h-[44px]',
        pressed
          ? 'bg-primary border-primary text-on-primary'
          : 'border-border-input text-text-secondary hover:text-text-primary hover:bg-surface-hover'
      )}
    >
      {label}
    </button>
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
  /** Rejects when the create fails; the form then stays as it is and says why. */
  onSubmit: (input: CreateAutomationInput) => unknown;
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
    queries.length > 0 ? [{ queryId: queries[0].id, role: 'include', sortOrder: 0 }] : []
  );
  const [selection, setSelection] = useState<TaskSelection | null>(null);
  const selectedTask = selection?.task ?? null;
  const taskParameterValue = selection?.parameterValue ?? '';
  const effectConfirmed = selection?.confirmed ?? false;

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

  const hasInclude = automationQueries.some((s) => s.role === 'include');

  // Only a destructive task states its blast radius, so only it asks the server to count.
  const previewDraft =
    selectedTask?.destructive && hasInclude
      ? {
          providerId: selectedTask.providerId,
          taskId: selectedTask.taskId,
          queries: automationQueries.map((q) => ({ queryId: q.queryId, role: q.role })),
        }
      : null;
  const preview = useAutomationPreview(previewDraft);
  const radius = hasInclude ? blastRadius(preview) : null;

  const hasRequiredParameter = !selectedTask?.parameter || taskParameterValue.trim().length > 0;

  const canSubmit =
    name.trim().length > 0 &&
    hasInclude &&
    selectedTask !== null &&
    isValidCron &&
    hasRequiredParameter &&
    (!selectedTask.destructive || (effectConfirmed && radius?.state === 'counted'));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !selectedTask) return;
      setSubmitError(null);
      try {
        await onSubmit({
          name: name.trim(),
          queries: automationQueries,
          providerId: selectedTask.providerId,
          taskId: selectedTask.taskId,
          taskParameter: selectedTask.parameter ? taskParameterValue : undefined,
          schedule: effectiveCron,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Couldn't create the automation.");
      }
    },
    [canSubmit, automationQueries, selectedTask, name, effectiveCron, taskParameterValue, onSubmit]
  );

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="rounded-lg border border-border bg-surface-panel"
      noValidate
    >
      {/* Form header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-divider">
        <h2 className="text-sm font-semibold text-text-primary">New automation</h2>
      </div>

      <div className="px-4 sm:px-5 py-5 space-y-6">
        {/* ── Name ── */}
        <div>
          <label
            htmlFor="auto-name"
            className="block text-sm font-medium text-text-secondary mb-1.5"
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
            className="field max-w-md"
            required
          />
        </div>

        {/* ── Automation queries ── */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-1">Queries</p>
          <p className="text-xs text-text-muted mb-3">The media this automation acts on.</p>
          <AutomationQueryList
            automationQueries={automationQueries}
            queries={queries.map((q) => ({ id: q.id, name: q.name }))}
            onChange={(next) => {
              // The confirmation states a count for the queries it was given;
              // a different set of queries needs confirming afresh.
              setAutomationQueries(next);
              setSelection((current) => current && { ...current, confirmed: false });
            }}
          />
        </div>

        {/* ── Task ── */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-1">Task</p>
          <p className="text-xs text-text-muted mb-3">
            What to do with matched items. Destructive tasks delete or change data in the provider.
          </p>
          {tasksByProvider.length === 0 ? (
            <div className="rounded border border-border">
              <EmptyState
                icon={<Zap size={18} strokeWidth={1.5} aria-hidden="true" />}
                title="No tasks are enabled yet"
                description="Enable tasks on a connected provider to use them here."
                action={{ label: 'Go to Providers', href: '/settings' }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {tasksByProvider.map(([providerId, group]) => (
                <div key={providerId} className="rounded border border-border overflow-hidden">
                  <div className="px-3 py-1.5 bg-surface-bg/60 border-b border-divider">
                    <span className="text-xs font-medium text-text-secondary">
                      {group.providerName}
                      <span className="ml-1.5 font-normal text-text-muted">
                        {group.providerType}
                      </span>
                    </span>
                  </div>
                  <div className="divide-y divide-divider">
                    {group.tasks.map((bt: BuilderTask) => {
                      const selected =
                        selectedTask?.taskId === bt.taskId &&
                        selectedTask?.providerId === bt.providerId;
                      return (
                        <label
                          key={`${bt.providerId}-${bt.taskId}`}
                          className={cn(
                            'flex items-center gap-3 px-3.5 py-2.5 max-sm:min-h-[44px] cursor-pointer transition-colors',
                            selected ? 'bg-primary/15' : 'bg-surface-panel hover:bg-surface-bg/40'
                          )}
                        >
                          <input
                            type="radio"
                            name="task"
                            checked={selected}
                            onChange={() =>
                              setSelection({ task: bt, parameterValue: '', confirmed: false })
                            }
                            className="flex-shrink-0 text-primary"
                          />
                          <div className="flex flex-1 min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                selected ? 'text-primary-text' : 'text-text-primary'
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
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              {selectParameter.label}
            </label>
            <select
              id="task-parameter"
              value={taskParameterValue}
              onChange={(e) => {
                const parameterValue = e.target.value;
                setSelection((current) => current && { ...current, parameterValue });
              }}
              className="field max-w-md"
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

        {/* ── Destructive confirmation ── */}
        {selectedTask?.destructive && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3.5 py-3 text-sm text-text-primary space-y-2">
            <label
              className={cn(
                'flex items-start gap-2.5',
                radius?.state === 'counted' ? 'cursor-pointer' : 'cursor-not-allowed'
              )}
            >
              <input
                type="checkbox"
                checked={effectConfirmed && radius?.state === 'counted'}
                disabled={radius?.state !== 'counted'}
                onChange={(e) => {
                  const confirmed = e.target.checked;
                  setSelection((current) => current && { ...current, confirmed });
                }}
                className="mt-0.5 flex-shrink-0 text-primary disabled:opacity-40"
              />
              <span>
                {radius === null
                  ? 'Choose a query to see how many items this affects.'
                  : radius.state === 'counted'
                    ? `Confirm: ${selectedTask.label} · ${radius.phrase}`
                    : radius.phrase}
              </span>
            </label>
            {radius?.state === 'failed' && (
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
          </div>
        )}

        {/* ── Schedule ── */}
        <fieldset>
          <legend className="text-sm font-medium text-text-secondary mb-1">Schedule</legend>
          <p className="text-xs text-text-muted mb-3">When this automation runs.</p>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {SCHEDULE_PRESETS.map((p) => (
              <ScheduleChip
                key={p.value}
                label={p.label}
                pressed={!isCustom && schedulePreset === p.value}
                onClick={() => {
                  setSchedulePreset(p.value);
                  setIsCustom(false);
                }}
              />
            ))}
            <ScheduleChip label="Custom" pressed={isCustom} onClick={() => setIsCustom(true)} />
          </div>

          {/* Custom cron input */}
          {isCustom && (
            <div className="mb-2.5">
              <label
                htmlFor="auto-cron"
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Cron expression
              </label>
              <input
                id="auto-cron"
                type="text"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                placeholder="e.g. 0 3 * * 1-5"
                aria-invalid={!isValidCron && Boolean(customSchedule)}
                className={cn(
                  'field max-w-xs font-mono',
                  !isValidCron && customSchedule && 'border-danger'
                )}
              />
              <p className="mt-1.5 text-xs text-text-muted max-w-prose">
                Five fields: minute, hour, day of month, month, day of week. A * means every value,
                so 0 3 * * 1-5 runs at 03:00, Monday to Friday.
              </p>
            </div>
          )}

          {/* Schedule description */}
          {effectiveCron && (
            <div
              className={cn(
                'flex items-center gap-2 text-xs',
                isValidCron ? 'text-text-secondary' : 'text-danger-text'
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
        </fieldset>

        {/* ── Submit ── */}
        {submitError && (
          <p role="alert" className="text-sm text-danger-text">
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-divider">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create automation'}
          </Button>
        </div>
      </div>
    </form>
  );
}
