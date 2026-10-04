import { useId } from 'react';

// ─── Mobile year inputs — better UX on touch than a 144px slider ──────────────

export function MobileYearInputs({
  yearMin,
  yearMax,
  globalMin,
  globalMax,
  setYearMin,
  setYearMax,
}: {
  yearMin: number | undefined;
  yearMax: number | undefined;
  globalMin: number;
  globalMax: number;
  setYearMin: (v: number | undefined) => void;
  setYearMax: (v: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor={`${id}-from`} className="block text-xs text-text-muted mb-1.5">
          From
        </label>
        <input
          id={`${id}-from`}
          type="number"
          placeholder={String(globalMin)}
          value={yearMin !== undefined ? yearMin : ''}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            setYearMin(Number.isNaN(v) ? undefined : v);
          }}
          className="w-full px-3 py-2.5 rounded-md text-sm bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <span className="text-text-muted pb-3">–</span>
      <div className="flex-1">
        <label htmlFor={`${id}-to`} className="block text-xs text-text-muted mb-1.5">
          To
        </label>
        <input
          id={`${id}-to`}
          type="number"
          placeholder={String(globalMax)}
          value={yearMax !== undefined ? yearMax : ''}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            setYearMax(Number.isNaN(v) ? undefined : v);
          }}
          className="w-full px-3 py-2.5 rounded-md text-sm bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}
