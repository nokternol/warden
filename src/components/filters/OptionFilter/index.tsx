import { cn } from '@app/lib/utils/cn';

// ─── XIcon ────────────────────────────────────────────────────────────────────

function XIcon({ size }: { size: 'sm' | 'md' }) {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      className={cn('flex-shrink-0', size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3')}
      aria-hidden="true"
    >
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// ─── OptionFilter ─────────────────────────────────────────────────────────────
//
// Compact segmented control. "All" is implicit — value === undefined means
// nothing selected (no option highlighted, no clear visible).
//
// Selecting an option highlights it in teal and adds an inline × to clear.
// Clicking the active option again also clears it.
//
// variant="segment" — unified bordered pill, h-7 (28px). Desktop filter bars.
// variant="chips"   — loose wrapping pills, min-h-[44px]. Mobile modals.

export interface OptionFilterOption<T extends string> {
  value: T;
  label: string;
}

export interface OptionFilterProps<T extends string> {
  /** Dimension label displayed before the control. Omit when context is clear. */
  label?: string;
  /** Non-default options. Do not include an "All" entry — that state is implicit. */
  options: readonly OptionFilterOption<T>[];
  /** Current value. `undefined` means "All" / nothing selected. */
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  /** Visual style. `segment` (default) = compact unified pill. `chips` = touch-friendly loose pills. */
  variant?: 'segment' | 'chips';
}

export function OptionFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'segment',
}: OptionFilterProps<T>) {
  if (variant === 'chips') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(isSelected ? undefined : opt.value)}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2.5 rounded-md text-sm font-medium border transition-colors min-h-[44px]',
                isSelected
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-panel text-text-secondary border-border hover:bg-surface-hover'
              )}
            >
              {opt.label}
              {isSelected && <XIcon size="md" />}
            </button>
          );
        })}
      </div>
    );
  }

  // segment variant — compact desktop control
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-xs text-text-muted whitespace-nowrap">{label}</span>}
      <div className="flex items-stretch h-7 rounded-md border border-border overflow-hidden">
        {options.map((opt, i) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(isSelected ? undefined : opt.value)}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center gap-1 px-2.5 text-xs font-medium transition-colors leading-none',
                i > 0 && 'border-l border-border',
                isSelected
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              )}
            >
              {opt.label}
              {isSelected && <XIcon size="sm" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default OptionFilter;
