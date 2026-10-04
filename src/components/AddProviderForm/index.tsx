import Button from '@app/components/Button';
import ConnectionTestIcon from '@app/components/ConnectionTestIcon';
import type { TestStatus } from '@app/components/ConnectionTestIcon';
import type { CreateProviderParams } from '@app/hooks/useProviderSettings';
import { descriptorFor } from '@app/hooks/useProviderTypes';
import { api } from '@app/lib/api/client';
import type { ProviderTypeDescriptor } from '@contract/providers';
import { type ProviderType, ProviderTypeSchema } from '@contract/schemas';
import { useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddFormState {
  /** The type the user picked; absent until they pick one. */
  type?: ProviderType;
  name: string;
  url: string;
  apiKey: string;
  userId: string;
}

// ─── AddProviderForm ──────────────────────────────────────────────────────────

export default function AddProviderForm({
  types,
  onSubmit,
  onCancel,
}: {
  types: ProviderTypeDescriptor[];
  onSubmit: (params: CreateProviderParams) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AddFormState>({
    name: '',
    url: '',
    apiKey: '',
    userId: '',
  });
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState<string | undefined>();
  const testAbortRef = useRef<AbortController | null>(null);

  const runTest = async (url: string, apiKey: string, type: ProviderType) => {
    if (!url) return;
    testAbortRef.current?.abort();
    const ac = new AbortController();
    testAbortRef.current = ac;
    setTestStatus('loading');
    setTestError(undefined);
    try {
      const result = await api.providers.test(
        { type, url, apiKey: apiKey || undefined },
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

  const chosen = form.type ? descriptorFor(types, form.type) : types[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    const host = form.url.replace(/\/+$/, '');
    const fullUrl = `${host}${chosen.apiPath}`;
    const settings =
      chosen.type === 'JELLYFIN' && form.userId ? { userId: form.userId } : undefined;

    onSubmit({
      type: chosen.type,
      name: form.name,
      url: fullUrl,
      apiKey: form.apiKey || undefined,
      settings,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 border border-primary/30 rounded-lg bg-surface-panel space-y-4"
    >
      <div className="text-sm font-medium text-text-primary">Add provider</div>
      {types.length === 0 && (
        <p className="text-xs text-text-muted">No provider types are available to add.</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-type" className="block text-xs text-text-secondary mb-1">
            Type
          </label>
          <select
            id="add-type"
            value={chosen?.type}
            onChange={(e) => {
              const newType = ProviderTypeSchema.parse(e.target.value);
              const defaultUrl = descriptorFor(types, newType)?.defaultUrl;
              setForm((f) => ({ ...f, type: newType, url: defaultUrl ?? f.url }));
              setTestStatus('idle');
              setTestError(undefined);
            }}
            className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
          >
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-name" className="block text-xs text-text-secondary mb-1">
            Name
          </label>
          <input
            id="add-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="My Radarr"
            className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
            required
          />
        </div>
        <div className="col-span-2">
          <label htmlFor="add-url" className="block text-xs text-text-secondary mb-1">
            Host URL
            <span className="ml-1.5">
              <ConnectionTestIcon status={testStatus} />
            </span>
            {testError && <span className="ml-1.5 text-xs text-danger-hover">{testError}</span>}
          </label>
          {chosen?.defaultUrl !== undefined ? (
            <input
              id="add-url"
              type="url"
              value={form.url}
              readOnly
              className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-muted cursor-not-allowed opacity-70"
            />
          ) : (
            <input
              id="add-url"
              type="url"
              value={form.url}
              onChange={(e) => {
                setForm((f) => ({ ...f, url: e.target.value }));
                setTestStatus('idle');
              }}
              onBlur={() => chosen && runTest(form.url, form.apiKey, chosen.type)}
              placeholder="http://localhost:7878"
              className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
              required
            />
          )}
        </div>
        <div>
          <label htmlFor="add-apikey" className="block text-xs text-text-secondary mb-1">
            API Key
          </label>
          <input
            id="add-apikey"
            type="password"
            value={form.apiKey}
            onChange={(e) => {
              setForm((f) => ({ ...f, apiKey: e.target.value }));
              setTestStatus('idle');
            }}
            onBlur={() => chosen && runTest(form.url, form.apiKey, chosen.type)}
            placeholder="Optional"
            className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
          />
        </div>
        {chosen?.type === 'JELLYFIN' && (
          <div>
            <label htmlFor="add-userid" className="block text-xs text-text-secondary mb-1">
              User ID
            </label>
            <input
              id="add-userid"
              type="text"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="Jellyfin user ID"
              className="w-full px-3 py-1.5 text-sm bg-surface-bg border border-border rounded text-text-primary focus:border-primary focus:outline-none transition-colors"
            />
          </div>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!chosen}>
          Save
        </Button>
      </div>
    </form>
  );
}
