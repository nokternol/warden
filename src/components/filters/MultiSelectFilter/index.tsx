import { useState } from 'react';

export interface MultiSelectOption<T extends string | number> {
  value: T;
  label: string;
}

export interface MultiSelectFilterProps<T extends string | number> {
  label: string;
  options: readonly MultiSelectOption<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

export function MultiSelectFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        {label}
      </button>
      {isOpen && (
        <div role="menu" aria-label={label}>
          {options.map((o) => (
            <div
              key={o.value}
              role="menuitemcheckbox"
              aria-checked={selected.includes(o.value)}
              tabIndex={-1}
              onClick={() => onChange([...selected, o.value])}
              onKeyDown={(e) => e.key === 'Enter' && onChange([...selected, o.value])}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
