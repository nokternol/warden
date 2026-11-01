import Button from '@app/components/Button';
import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const CONFIRM_PHRASE = 'RESET';
const SUCCESS_DISMISS_MS = 2200;

type Phase = 'idle' | 'confirming' | 'resetting' | 'success' | 'error';

export default function MediaResetControl({
  onReset,
  titleCount,
}: {
  onReset: () => Promise<{ deletedIdentities: number }>;
  /** How many titles the library lists, when that is known. */
  titleCount?: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [deletedCount, setDeletedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const opened = phase === 'confirming';
  useEffect(() => {
    if (opened) inputRef.current?.focus();
  }, [opened]);

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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setPhase('confirming')}
      >
        <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
        Reset media data
      </Button>
    );
  }

  if (phase === 'success') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-success/30 bg-success/10 text-success max-w-prose"
      >
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        Media data reset — {deletedCount.toLocaleString()} {deletedCount === 1 ? 'item' : 'items'}{' '}
        cleared
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 max-w-prose">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          strokeWidth={2}
          className="text-danger-text mt-0.5 flex-shrink-0"
          aria-hidden="true"
        />
        <p className="text-sm text-text-primary">
          {titleCount !== undefined && `Your library lists ${titleCount.toLocaleString()} titles. `}
          Deletes every resolved title and its enrichment data. Nothing is fetched from Radarr,
          Sonarr, or your other providers — this is a local rebuild only. Run identity resolution
          and enrichment afterwards to repopulate.
        </p>
      </div>
      <label className="block mt-2.5">
        <span className="text-sm text-text-secondary">
          Type <span className="font-mono font-semibold text-text-primary">{CONFIRM_PHRASE}</span>{' '}
          to confirm
        </span>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={phase === 'resetting'}
          className="field mt-1 font-mono disabled:opacity-40"
        />
      </label>
      {phase === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-sm bg-danger/10 border border-danger/30 text-sm text-danger-text"
        >
          <X size={12} strokeWidth={2.5} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {errorMessage}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2.5">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={typed !== CONFIRM_PHRASE || phase === 'resetting'}
          onClick={() => {
            void confirmReset();
          }}
        >
          {phase === 'resetting' ? 'Resetting…' : phase === 'error' ? 'Retry' : 'Reset media data'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={phase === 'resetting'}
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
