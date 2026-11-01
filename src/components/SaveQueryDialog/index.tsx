import Button from '@app/components/Button';
import { cn } from '@app/lib/utils/cn';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface SaveQueryDialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog waits for this; a rejection keeps it open and says why. */
  onSave: (name: string) => unknown;
}

export function SaveQueryDialog({ open, onClose, onSave }: SaveQueryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const inputId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      setName('');
      setError('');
      requestAnimationFrame(() => inputRef.current?.select());
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handler);
    return () => dialog.removeEventListener('cancel', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name for this query.');
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the query.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      className="m-auto p-0 bg-transparent max-w-sm w-[calc(100%-2rem)] border-none outline-none backdrop:bg-scrim/60"
    >
      <div className="bg-surface-elevated rounded-lg overflow-hidden shadow-card-elevated">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-divider">
          <h2 id={headingId} className="text-sm font-semibold text-text-primary">
            Save as query
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center size-11 sm:size-6 rounded text-text-muted hover:text-text-primary hover:bg-surface-panel transition-colors"
          >
            <X size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          noValidate
          className="px-5 py-4 space-y-4"
        >
          <div>
            <label
              htmlFor={inputId}
              className="block text-xs font-medium text-text-secondary mb-1.5"
            >
              Query name
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Unwatched 4K movies"
              maxLength={80}
              autoComplete="off"
              className={cn('field', error && 'border-danger')}
            />
            {error ? (
              <p role="alert" className="mt-1.5 text-xs text-danger-text">
                {error}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-text-muted">
                The active filters will be saved with this name.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-0.5">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save query'}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
