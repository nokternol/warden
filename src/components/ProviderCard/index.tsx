import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import ConnectionTestIcon from '@app/components/ConnectionTestIcon';
import type { TestStatus } from '@app/components/ConnectionTestIcon';
import Toggle from '@app/components/Toggle';
import type { ProviderSummary, UpdateProviderParams } from '@app/hooks/useProviderSettings';
import type { ProviderTaskDescriptor } from '@app/hooks/useProviderTasks';
import { api } from '@app/lib/api/client';
import { cn } from '@app/lib/utils/cn';
import type { ProviderTypeDescriptor } from '@contract/providers';
import {
  BarChart2,
  Bell,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Database,
  Film,
  Play,
  Plug,
  Star,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { useRef, useState } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_SUFFIXES: Record<string, string> = {
  SONARR: '/api/v3',
  RADARR: '/api/v3',
  PLEX: '',
  JELLYFIN: '',
  TAUTULLI: '',
  OVERSEERR: '',
  TMDB: '',
  OMDB: '',
};

// ─── Local helpers ────────────────────────────────────────────────────────────

function stripSuffix(url: string, type: string): string {
  const suffix = API_SUFFIXES[type] ?? '';
  if (suffix && url.endsWith(suffix)) return url.slice(0, -suffix.length);
  return url;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PLEX: <Play size={15} strokeWidth={1.75} />,
  JELLYFIN: <Film size={15} strokeWidth={1.75} />,
  RADARR: <Clapperboard size={15} strokeWidth={1.75} />,
  SONARR: <Tv size={15} strokeWidth={1.75} />,
  TAUTULLI: <BarChart2 size={15} strokeWidth={1.75} />,
  OVERSEERR: <Bell size={15} strokeWidth={1.75} />,
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

function StatusIndicator({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        isActive ? 'text-success' : 'text-text-muted'
      )}
    >
      <span
        className={cn(
          'inline-block w-1.5 h-1.5 rounded-full',
          isActive ? 'bg-success' : 'bg-text-muted'
        )}
      />
      {isActive ? 'Connected' : 'Inactive'}
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
  providerType,
  tasks,
  onUpdate,
  onDelete,
}: {
  provider: ProviderSummary;
  /** The served description of the provider's type; absent for a type that is not offered. */
  providerType?: ProviderTypeDescriptor;
  tasks: ProviderTaskDescriptor[];
  onUpdate: (patch: UpdateProviderParams) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [editForm, setEditForm] = useState<EditFormState>({
    name: provider.name,
    url: stripSuffix(provider.url, provider.type),
    apiKey: '',
    userId: typeof provider.settings?.userId === 'string' ? provider.settings.userId : '',
  });
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState<string | undefined>();
  const testAbortRef = useRef<AbortController | null>(null);

  const [localEnabledTasks, setLocalEnabledTasks] = useState<string[] | null>(null);
  const [taskToggleLoading, setTaskToggleLoading] = useState<string | null>(null);
  const [taskToggleError, setTaskToggleError] = useState<string | null>(null);

  // Enablement is server truth (per instance, default off). Local state holds an
  // optimistic override while a toggle is in flight.
  const serverEnabledIds = tasks.filter((t) => t.enabled).map((t) => t.id);
  const enabledTasks = localEnabledTasks ?? serverEnabledIds;
  const allTasks = tasks;
  const capabilities = providerType?.capabilities ?? [];
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
        { type: provider.type, url, apiKey: apiKey || undefined },
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
    const suffix = API_SUFFIXES[provider.type] ?? '';
    const host = editForm.url.replace(/\/+$/, '');
    const fullUrl = suffix ? `${host}${suffix}` : host;

    const patch: UpdateProviderParams = { name: editForm.name, url: fullUrl };
    if (editForm.apiKey) patch.apiKey = editForm.apiKey;
    if (provider.type === 'JELLYFIN') {
      patch.settings = { ...(provider.settings ?? {}), userId: editForm.userId };
    }

    await onUpdate(patch);
    setEditing(false);
    setTestStatus('idle');
    setTestError(undefined);
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: provider.name,
      url: stripSuffix(provider.url, provider.type),
      apiKey: '',
      userId: typeof provider.settings?.userId === 'string' ? provider.settings.userId : '',
    });
    setEditing(false);
    setTestStatus('idle');
    setTestError(undefined);
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

  const capabilitySummary = (() => {
    const parts: string[] = [];
    if (capabilities.length > 0) {
      const labels = capabilities.slice(0, 2).join(' · ');
      parts.push(`Filter: ${labels}${capabilities.length > 2 ? ' +more' : ''}`);
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
        expanded
          ? 'border-primary/30 bg-surface-panel'
          : 'border-border bg-surface-panel hover:border-border/80'
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
        className="w-full flex items-start gap-3 p-4 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg focus-visible:outline-none rounded-lg"
        aria-expanded={expanded}
      >
        <ProviderTypeIcon type={provider.type} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-text-primary">{provider.name}</span>
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
              {providerType?.label ?? provider.type}
            </span>
            <StatusIndicator isActive={provider.isActive} />
          </div>
          <div className="text-xs text-text-muted mt-0.5 truncate">{provider.url}</div>
          {capabilitySummary && (
            <div className="text-xs text-text-muted mt-1">{capabilitySummary}</div>
          )}
        </div>

        <div className="shrink-0 text-text-muted mt-1">
          {expanded ? (
            <ChevronUp size={16} strokeWidth={1.75} />
          ) : (
            <ChevronDown size={16} strokeWidth={1.75} />
          )}
        </div>
      </button>

      {/* ─── Expanded content ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-4">
          {/* Connection section */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Connection
              </span>
              {!editing && !confirming && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg focus-visible:outline-none rounded"
                >
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-name`}
                      className="block text-xs text-text-secondary mb-1"
                    >
                      Name
                    </label>
                    <input
                      id={`edit-${provider.id}-name`}
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-url`}
                      className="block text-xs text-text-secondary mb-1"
                    >
                      Host URL
                      <span className="ml-1.5">
                        <ConnectionTestIcon status={testStatus} />
                      </span>
                      {testError && <span className="ml-1.5 text-danger-hover">{testError}</span>}
                    </label>
                    <input
                      id={`edit-${provider.id}-url`}
                      type="url"
                      value={editForm.url}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, url: e.target.value }));
                        setTestStatus('idle');
                      }}
                      onBlur={() => runTest(editForm.url, editForm.apiKey)}
                      className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-${provider.id}-apikey`}
                      className="block text-xs text-text-secondary mb-1"
                    >
                      API Key <span className="opacity-50">(leave blank to keep existing)</span>
                    </label>
                    <input
                      id={`edit-${provider.id}-apikey`}
                      type="password"
                      value={editForm.apiKey}
                      onChange={(e) => {
                        setEditForm((f) => ({ ...f, apiKey: e.target.value }));
                        setTestStatus('idle');
                      }}
                      onBlur={() => runTest(editForm.url, editForm.apiKey)}
                      placeholder="••••••••"
                      className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
                    />
                  </div>
                  {provider.type === 'JELLYFIN' && (
                    <div>
                      <label
                        htmlFor={`edit-${provider.id}-userid`}
                        className="block text-xs text-text-secondary mb-1"
                      >
                        User ID
                      </label>
                      <input
                        id={`edit-${provider.id}-userid`}
                        type="text"
                        value={editForm.userId}
                        onChange={(e) => setEditForm((f) => ({ ...f, userId: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => runTest(editForm.url, editForm.apiKey)}
                  >
                    Test connection
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-0.5">
                <div className="text-sm text-text-secondary">{provider.url}</div>
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
              {capabilities.length > 0 && (
                <section>
                  <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                    Filter data
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {capabilities.map((label) => (
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
                  <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                    Available tasks
                  </div>
                  <div className="space-y-0">
                    {allTasks.map((task, idx) => {
                      const isEnabled = enabledTasks.includes(task.id);
                      const isLoading = taskToggleLoading === task.id;
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            'flex items-center gap-3 py-2.5',
                            idx < allTasks.length - 1 && 'border-b border-border/40'
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
                                'text-sm font-medium truncate',
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
                    <p className="text-xs text-danger-hover mt-2">{taskToggleError}</p>
                  )}
                </section>
              )}

              {/* Delete / confirm */}
              <section className="pt-1">
                {confirming ? (
                  <div className="flex items-start gap-3 p-3 rounded bg-danger/5 border border-danger/20">
                    <div className="flex-1">
                      <p className="text-sm text-text-primary">
                        Delete <span className="font-medium">{provider.name}</span>? All associated
                        task configurations will be removed.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirming(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={onDelete}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="text-xs text-text-muted hover:text-danger-hover transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg focus-visible:outline-none rounded"
                  >
                    Delete provider
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
