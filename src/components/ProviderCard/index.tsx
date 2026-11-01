import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import type { TestStatus } from '@app/components/ConnectionTestIcon';
import { ConnectionTestResult } from '@app/components/ConnectionTestIcon/result';
import Toggle from '@app/components/Toggle';
import type { ProviderSummary, UpdateProviderParams } from '@app/hooks/useProviderSettings';
import type { ProviderTaskDescriptor } from '@app/hooks/useProviderTasks';
import { api } from '@app/lib/api/client';
import { cn } from '@app/lib/utils/cn';
import { apiUrlOf, hostOf } from '@contract/providerUrl';
import type { ProviderTypeDescriptor } from '@contract/providers';
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Database,
  Film,
  Inbox,
  Play,
  Plug,
  Star,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { useRef, useState } from 'react';

// ─── Sub-components ───────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PLEX: <Play size={15} strokeWidth={1.75} />,
  JELLYFIN: <Film size={15} strokeWidth={1.75} />,
  RADARR: <Clapperboard size={15} strokeWidth={1.75} />,
  SONARR: <Tv size={15} strokeWidth={1.75} />,
  TAUTULLI: <BarChart2 size={15} strokeWidth={1.75} />,
  SEERR: <Inbox size={15} strokeWidth={1.75} />,
  TMDB: <Star size={15} strokeWidth={1.75} />,
  OMDB: <Database size={15} strokeWidth={1.75} />,
};

function ProviderTypeIcon({ type }: { type: string }) {
  return (
    <div className="w-8 h-8 rounded flex items-center justify-center bg-surface-elevated text-text-secondary shrink-0">
      {TYPE_ICONS[type] ?? <Plug size={15} strokeWidth={1.75} />}
    </div>
  );
}

const CONNECTION_LABELS: Record<TestStatus, string> = {
  idle: 'Not tested',
  loading: 'Testing…',
  pass: 'Connected',
  fail: 'Connection failed',
};

/** Connected is only ever claimed from a test result; an active provider may be unreachable. */
function StatusIndicator({ isActive, test }: { isActive: boolean; test: TestStatus }) {
  const tone = !isActive
    ? 'text-text-muted'
    : test === 'pass'
      ? 'text-success'
      : test === 'fail'
        ? 'text-danger-text'
        : 'text-text-secondary';
  return (
    <span className={cn('text-xs font-medium', tone)}>
      {isActive ? CONNECTION_LABELS[test] : 'Inactive'}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditFormState {
  name: string;
  url: string;
  apiKey: string;
  userId: string;
}

// ─── ProviderCard ─────────────────────────────────────────────────────────────

export default function ProviderCard({
  provider,
  typeDescriptor,
  tasks,
  onUpdate,
  onDelete,
}: {
  provider: ProviderSummary;
  /** The served description of the provider's type; absent for a type that is not offered. */
  typeDescriptor?: ProviderTypeDescriptor;
  tasks: ProviderTaskDescriptor[];
  onUpdate: (patch: UpdateProviderParams) => Promise<unknown>;
  /** Rejects when the removal fails; the confirmation then stays and says why. */
  onDelete: () => unknown;
}) {
  const apiPath = typeDescriptor?.apiPath ?? '';
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [editForm, setEditForm] = useState<EditFormState>({
    name: provider.name,
    url: hostOf(provider.url, apiPath),
    apiKey: '',
    userId: typeof provider.settings?.userId === 'string' ? provider.settings.userId : '',
  });
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState<string | undefined>();
  const testAbortRef = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [localEnabledTasks, setLocalEnabledTasks] = useState<string[] | null>(null);
  const [taskToggleLoading, setTaskToggleLoading] = useState<string | null>(null);
  const [taskToggleError, setTaskToggleError] = useState<string | null>(null);

  // Enablement is server truth (per instance, default off). Local state holds an
  // optimistic override while a toggle is in flight.
  const serverEnabledIds = tasks.filter((t) => t.enabled).map((t) => t.id);
  const enabledTasks = localEnabledTasks ?? serverEnabledIds;
  const allTasks = tasks;
  const filterData = typeDescriptor?.filterData ?? [];
  const hasTasks = allTasks.length > 0;

  const runTest = async (url: string, apiKey: string) => {
    if (!url) return;
    testAbortRef.current?.abort();
    const ac = new AbortController();
    testAbortRef.current = ac;
    setTestStatus('loading');
    setTestError(undefined);
    try {
      const result = await api.providers.test(
        { type: provider.type, url, apiKey: apiKey || undefined, id: provider.id },
        { signal: ac.signal }
      );
      if (result.ok) {
        setTestStatus('pass');
      } else {
        setTestStatus('fail');
        setTestError(result.error ?? 'Connection failed');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setTestStatus('fail');
      setTestError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullUrl = apiUrlOf(editForm.url, apiPath);

    const patch: UpdateProviderParams = { name: editForm.name, url: fullUrl };
    if (editForm.apiKey) patch.apiKey = editForm.apiKey;
    if (provider.type === 'JELLYFIN') {
      patch.settings = { ...(provider.settings ?? {}), userId: editForm.userId };
    }

    setSaving(true);
    setActionError(null);
    try {
      await onUpdate(patch);
      setEditing(false);
      setTestStatus('idle');
      setTestError(undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save the provider.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setRemoving(true);
    setActionError(null);
    try {
      await onDelete();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete the provider.");
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: provider.name,
      url: hostOf(provider.url, apiPath),
      apiKey: '',
      userId: typeof provider.settings?.userId === 'string' ? provider.settings.userId : '',
    });
    setEditing(false);
    setTestStatus('idle');
    setTestError(undefined);
    setActionError(null);
  };

  const handleTaskToggle = async (taskId: string, enabled: boolean) => {
    const current = localEnabledTasks ?? serverEnabledIds;
    const next = enabled ? [...current, taskId] : current.filter((id) => id !== taskId);

    setLocalEnabledTasks(next);
    setTaskToggleLoading(taskId);
    setTaskToggleError(null);
    try {
      await onUpdate({
        settings: {
          ...(provider.settings ?? {}),
          enabledTasks: next,
        },
      });
    } catch {
      setLocalEnabledTasks(current);
      setTaskToggleError('Failed to save — try again.');
    } finally {
      setTaskToggleLoading(null);
    }
  };

  const summary = (() => {
    const parts: string[] = [];
    if (filterData.length > 0) {
      const labels = filterData.slice(0, 2).join(' · ');
      parts.push(`Filter: ${labels}${filterData.length > 2 ? ' +more' : ''}`);
    }
    if (hasTasks) {
      parts.push(`Tasks: ${enabledTasks.length} of ${allTasks.length} enabled`);
    }
    return parts.join('  ·  ');
  })();

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors duration-150',
        expanded ? 'border-border-input bg-surface-panel' : 'border-border bg-surface-panel'
      )}
    >
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          if (expanded) {
            setEditing(false);
            setConfirming(false);
          }
        }}
        className="w-full flex items-start gap-3 p-4 text-left rounded-lg"
        aria-expanded={expanded}
      >
        <ProviderTypeIcon type={provider.type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-text-primary">{provider.name}</span>
            <Badge size="sm">{typeDescriptor?.label ?? provider.type}</Badge>
            <StatusIndicator isActive={provider.isActive} test={testStatus} />
          </div>
          <div className="text-xs text-text-muted mt-0.5 break-all">{provider.url}</div>
          {summary && <div className="text-xs text-text-muted mt-1">{summary}</div>}
        </div>

        <div className="shrink-0 text-text-muted mt-1">
          {expanded ? (
            <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
        </div>
      </button>

      {/* ─── Expanded content ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-divider px-4 pb-4 pt-3 space-y-4">
          {/* Connection section */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-medium text-text-muted">Connection</h3>
              {!editing && !confirming && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={testStatus === 'loading'}
                    onClick={() => {
                      void runTest(hostOf(provider.url, apiPath), '');
                    }}
                  >
                    Test connection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-name`}
                      className="block text-sm font-medium text-text-secondary mb-1"
                    >
                      Name
                    </label>
                    <input
                      id={`edit-${provider.id}-name`}
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="field"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-url`}
                      className="block text-sm font-medium text-text-secondary mb-1"
                    >
                      Host URL
                    </label>
                    <input
                      id={`edit-${provider.id}-url`}
                      type="url"
                      value={editForm.url}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, url: e.target.value }));
                        setTestStatus('idle');
                      }}
                      className="field"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-apikey`}
                      className="block text-sm font-medium text-text-secondary mb-1"
                    >
                      API key <span className="font-normal text-text-muted">(blank keeps it)</span>
                    </label>
                    <input
                      id={`edit-${provider.id}-apikey`}
                      type="password"
                      value={editForm.apiKey}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, apiKey: e.target.value }));
                        setTestStatus('idle');
                      }}
                      placeholder="••••••••"
                      className="field"
                    />
                  </div>
                  {provider.type === 'JELLYFIN' && (
                    <div>
                      <label
                        htmlFor={`edit-${provider.id}-userid`}
                        className="block text-sm font-medium text-text-secondary mb-1"
                      >
                        User ID
                      </label>
                      <input
                        id={`edit-${provider.id}-userid`}
                        type="text"
                        value={editForm.userId}
                        onChange={(e) => setEditForm((f) => ({ ...f, userId: e.target.value }))}
                        className="field"
                      />
                    </div>
                  )}
                </div>
                <ConnectionTestResult status={testStatus} error={testError} />
                {actionError && (
                  <p role="alert" className="text-sm text-danger-text">
                    {actionError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void runTest(editForm.url, editForm.apiKey);
                    }}
                  >
                    Test connection
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-1">
                <ConnectionTestResult status={testStatus} error={testError} />
                <div className="text-sm text-text-secondary break-all">{provider.url}</div>
                {provider.apiKey && (
                  <div className="text-xs text-text-muted">API key configured</div>
                )}
                {provider.type === 'JELLYFIN' && typeof provider.settings?.userId === 'string' && (
                  <div className="text-xs text-text-muted">User ID: {provider.settings.userId}</div>
                )}
              </div>
            )}
          </section>

          {/* Capabilities section */}
          {!editing && (
            <>
              {/* Filter data */}
              {filterData.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium text-text-muted mb-2">Filter data</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {filterData.map((label) => (
                      <span
                        key={label}
                        className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Available tasks */}
              {hasTasks && (
                <section>
                  <h3 className="text-xs font-medium text-text-muted mb-2">Available tasks</h3>
                  <div className="space-y-0">
                    {allTasks.map((task, idx) => {
                      const isEnabled = enabledTasks.includes(task.id);
                      const isLoading = taskToggleLoading === task.id;
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'flex items-center gap-3 py-2.5',
                            idx < allTasks.length - 1 && 'border-b border-divider'
                          )}
                        >
                          <Toggle
                            checked={isEnabled}
                            onChange={(v) => handleTaskToggle(task.id, v)}
                            disabled={isLoading}
                            label={`${isEnabled ? 'Disable' : 'Enable'} "${task.label}"`}
                          />
                          <div className="flex flex-1 min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                isEnabled ? 'text-text-primary' : 'text-text-muted'
                              )}
                            >
                              {task.label}
                            </span>
                            {task.destructive && (
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
                        </div>
                      );
                    })}
                  </div>
                  {taskToggleError && (
                    <p role="alert" className="text-xs text-danger-text mt-2">
                      {taskToggleError}
                    </p>
                  )}
                </section>
              )}

              {/* Delete / confirm */}
              <section className="pt-1">
                {confirming ? (
                  <div className="p-3 rounded bg-danger/10 border border-danger/40 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="flex-1 min-w-48 text-sm text-text-primary">
                        Delete <span className="font-medium">{provider.name}</span>? All associated
                        task configurations will be removed.
                      </p>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirming(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={removing}
                          onClick={() => {
                            void handleDelete();
                          }}
                        >
                          {removing ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                    {actionError && (
                      <p role="alert" className="text-sm text-danger-text">
                        {actionError}
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirming(true)}
                  >
                    Delete provider
                  </Button>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
