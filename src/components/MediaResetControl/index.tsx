import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

const CONFIRM_PHRASE = 'RESET';
const SUCCESS_DISMISS_MS = 2200;

type Phase = 'idle' | 'confirming' | 'resetting' | 'success' | 'error';

export default function MediaResetControl({
  onReset,
}: {
  onReset: () => Promise<{ deletedIdentities: number }>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [deletedCount, setDeletedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const cancel = () => {
    setPhase('idle');
    setTyped('');
  };

  const confirmReset = async () => {
    setPhase('resetting');
    try {
      const result = await onReset();
      setDeletedCount(result.deletedIdentities);
      setPhase('success');
      setTyped('');
      setTimeout(() => setPhase('idle'), SUCCESS_DISMISS_MS);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to reset media data');
      setPhase('error');
    }
  };

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setPhase('confirming')}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm border border-border text-text-muted hover:text-danger-text hover:border-danger/40 hover:bg-danger/10 transition-colors"
      >
        <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
        Reset media data
      </button>
    );
  }

  if (phase === 'success') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-success/30 bg-success/10 text-success max-w-sm"
      >
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        Media data reset — {deletedCount.toLocaleString()} {deletedCount === 1 ? 'item' : 'items'}{' '}
        cleared
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 max-w-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          strokeWidth={2}
          className="text-danger-text mt-0.5 flex-shrink-0"
          aria-hidden="true"
        />
        <p className="text-xs text-text-secondary leading-5">
          Deletes every resolved title and its enrichment data. Nothing is fetched from Radarr,
          Sonarr, or your other providers — this is a local rebuild only. Run identity resolution
          and enrichment afterwards to repopulate.
        </p>
      </div>
      <label className="block mt-2.5">
        <span className="text-[11px] text-text-muted">
          Type <span className="font-mono font-semibold text-text-primary">{CONFIRM_PHRASE}</span>{' '}
          to confirm
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={phase === 'resetting'}
          className="mt-1 w-full px-2 py-1 text-xs font-mono rounded-sm border border-border bg-surface-panel text-text-primary disabled:opacity-50"
        />
      </label>
      {phase === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-sm bg-danger/10 border border-danger/30 text-[11px] text-danger-text leading-4"
        >
          <X size={12} strokeWidth={2.5} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {errorMessage}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2.5">
        <button
          type="button"
          disabled={typed !== CONFIRM_PHRASE || phase === 'resetting'}
          onClick={() => {
            void confirmReset();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm bg-danger text-on-danger hover:bg-danger-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {phase === 'resetting' && (
            <svg
              className="w-3 h-3 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {phase === 'resetting' ? 'Resetting…' : phase === 'error' ? 'Retry' : 'Reset media data'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={phase === 'resetting'}
          className="px-2.5 py-1 text-[11px] rounded-sm bg-surface-panel border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
