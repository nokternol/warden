import { cn } from '@app/lib/utils/cn';
import { useEffect, useId, useRef, useState } from 'react';

// ─── NumberRangeFilter ────────────────────────────────────────────────────────

function parseNumber(s: string): number | undefined {
  const n = Number.parseFloat(s);
  return s.trim() === '' || Number.isNaN(n) ? undefined : n;
}

export function NumberRangeFilter({
  label,
  min,
  max,
  dataMin = null,
  dataMax = null,
  onChangeMin,
  onChangeMax,
}: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  dataMin?: number | null;
  dataMax?: number | null;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
}) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const draftMinRef = useRef('');
  const draftMaxRef = useRef('');
  const [draftMin, setDraftMinRaw] = useState('');
  const [draftMax, setDraftMaxRaw] = useState('');

  const isActive = min !== undefined || max !== undefined;

  const setDraftMin = (v: string) => {
    draftMinRef.current = v;
    setDraftMinRaw(v);
  };
  const setDraftMax = (v: string) => {
    draftMaxRef.current = v;
    setDraftMaxRaw(v);
  };

  useEffect(() => {
    if (!isOpen) return;
    const minStr = min != null ? String(min) : '';
    const maxStr = max != null ? String(max) : '';
    draftMinRef.current = minStr;
    draftMaxRef.current = maxStr;
    setDraftMinRaw(minStr);
    setDraftMaxRaw(maxStr);
    requestAnimationFrame(() => fromInputRef.current?.focus());
  }, [isOpen, min, max]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onChangeMin(parseNumber(draftMinRef.current));
        onChangeMax(parseNumber(draftMaxRef.current));
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onChangeMin, onChangeMax]);

  const commitAndClose = () => {
    onChangeMin(parseNumber(draftMinRef.current));
    onChangeMax(parseNumber(draftMaxRef.current));
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const clearAndClose = () => {
    draftMinRef.current = '';
    draftMaxRef.current = '';
    onChangeMin(undefined);
    onChangeMax(undefined);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commitAndClose();
    }
  };

  const buttonLabel = isActive ? `${min ?? '…'}–${max ?? '…'}` : label;
  const fromPlaceholder = dataMin != null ? String(dataMin) : 'Min';
  const toPlaceholder = dataMax != null ? String(dataMax) : 'Max';

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          isActive
            ? `${label} filter: ${min ?? 'any'} to ${max ?? 'any'}, click to change`
            : `${label} filter`
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1 px-2.5 rounded-md text-xs font-medium border transition-colors h-7',
          isActive
            ? 'bg-primary text-white border-primary'
            : 'bg-surface-panel text-text-secondary border-border hover:bg-surface-hover'
        )}
      >
        <span className={isActive ? 'font-mono tabular-nums' : ''}>{buttonLabel}</span>
        <svg
          className="w-3 h-3 opacity-50 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`${label} range filter`}
          className="absolute top-full left-0 mt-1 z-20 bg-surface-elevated border border-border rounded-lg p-3 w-48"
          style={{
            boxShadow:
              'inset 0 0 0 1px rgba(13,148,136,0.18), 0 4px 24px rgba(13,148,136,0.08), 0 1px 6px rgba(0,0,0,0.50)',
          }}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label
                htmlFor={`${id}-from`}
                className="block text-[10px] text-text-muted mb-1 select-none"
              >
                From
              </label>
              <input
                ref={fromInputRef}
                id={`${id}-from`}
                type="number"
                value={draftMin}
                placeholder={fromPlaceholder}
                onChange={(e) => setDraftMin(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-2 py-1.5 rounded text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
              />
            </div>
            <span className="text-text-muted text-xs pb-[9px] flex-shrink-0">–</span>
            <div className="flex-1 min-w-0">
              <label
                htmlFor={`${id}-to`}
                className="block text-[10px] text-text-muted mb-1 select-none"
              >
                To
              </label>
              <input
                id={`${id}-to`}
                type="number"
                value={draftMax}
                placeholder={toPlaceholder}
                onChange={(e) => setDraftMax(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-2 py-1.5 rounded text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <button
              type="button"
              onClick={clearAndClose}
              disabled={!isActive && !draftMin && !draftMax}
              className={cn(
                'text-[10px] transition-colors underline underline-offset-2',
                isActive || draftMin || draftMax
                  ? 'text-text-muted hover:text-text-primary'
                  : 'text-text-muted/30 pointer-events-none'
              )}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={commitAndClose}
              className="text-xs font-medium px-3 py-1 rounded bg-primary text-white hover:bg-primary-hover transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-1 focus:ring-offset-surface-elevated"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
