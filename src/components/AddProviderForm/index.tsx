import Button from '@app/components/Button';
import type { TestStatus } from '@app/components/ConnectionTestIcon';
import { ConnectionTestResult } from '@app/components/ConnectionTestIcon/result';
import type { CreateProviderParams } from '@app/hooks/useProviderSettings';
import { descriptorFor } from '@app/hooks/useProviderTypes';
import { api } from '@app/lib/api/client';
import { apiUrlOf } from '@contract/providerUrl';
import type { ProviderType, ProviderTypeDescriptor } from '@contract/providers';
import { ProviderTypeSchema } from '@contract/schemas';
import { useRef, useState } from 'react';

const LABEL = 'block text-sm font-medium text-text-secondary mb-1';

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
  types: servedTypes,
  onSubmit,
  onCancel,
}: {
  /** The served provider types; absent while they load. */
  types: ProviderTypeDescriptor[] | undefined;
  /** Rejects when the save fails; the form then stays as it is and says why. */
  onSubmit: (params: CreateProviderParams) => unknown;
  onCancel: () => void;
}) {
  const types = servedTypes ?? [];
  const [form, setForm] = useState<AddFormState>({
    name: '',
    url: '',
    apiKey: '',
    userId: '',
  });
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const missingKey = Boolean(chosen?.apiKeyRequired) && form.apiKey.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || missingKey) return;
    const fullUrl = apiUrlOf(form.url, chosen.apiPath);
    const settings =
      chosen.type === 'JELLYFIN' && form.userId ? { userId: form.userId } : undefined;

    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({
        type: chosen.type,
        name: form.name,
        url: fullUrl,
        apiKey: form.apiKey || undefined,
        settings,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't add the provider.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="p-4 border border-border rounded-lg bg-surface-panel space-y-4"
    >
      <h2 className="text-sm font-semibold text-text-primary">Add provider</h2>
      {servedTypes === undefined && (
        <p className="text-xs text-text-muted">Loading provider types…</p>
      )}
      {servedTypes?.length === 0 && (
        <p className="text-xs text-text-muted">No provider types are available to add.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-type" className={LABEL}>
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
            className="field"
          >
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-name" className={LABEL}>
            Name
          </label>
          <input
            id="add-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={chosen ? `My ${chosen.label}` : undefined}
            className="field"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="add-url" className={LABEL}>
            Host URL
          </label>
          {chosen?.defaultUrl !== undefined ? (
            <input
              id="add-url"
              type="url"
              value={form.url}
              readOnly
              className="field text-text-muted cursor-not-allowed"
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
              placeholder={chosen?.hostPlaceholder}
              className="field"
              required
            />
          )}
        </div>
        <div>
          <label htmlFor="add-apikey" className={LABEL}>
            API key{chosen && !chosen.apiKeyRequired && ' (optional)'}
          </label>
          <input
            id="add-apikey"
            type="password"
            value={form.apiKey}
            onChange={(e) => {
              setForm((f) => ({ ...f, apiKey: e.target.value }));
              setTestStatus('idle');
            }}
            autoComplete="off"
            required={chosen?.apiKeyRequired}
            className="field"
          />
        </div>
        {chosen?.type === 'JELLYFIN' && (
          <div>
            <label htmlFor="add-userid" className={LABEL}>
              User ID
            </label>
            <input
              id="add-userid"
              type="text"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="Jellyfin user ID"
              className="field"
            />
          </div>
        )}
      </div>

      <ConnectionTestResult status={testStatus} error={testError} />
      {saveError && (
        <p role="alert" className="text-sm text-danger-text">
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!chosen || !form.url || testStatus === 'loading'}
          onClick={() => {
            if (chosen) void runTest(form.url, form.apiKey, chosen.type);
          }}
        >
          Test connection
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!chosen || missingKey || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
