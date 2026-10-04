import { useState } from 'react';

export interface MultiSelectOption<T extends string | number> {
  value: T;
  label: string;
  /** Heading the option is listed under. Options sharing a group render together. */
  group?: string;
}

export interface MultiSelectFilterProps<T extends string | number> {
  label: string;
  options: readonly MultiSelectOption<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

/** Splits options into groups in first-seen order; ungrouped options form one headingless group. */
function groupsOf<T extends string | number>(
  options: readonly MultiSelectOption<T>[]
): Array<[string | undefined, MultiSelectOption<T>[]]> {
  const groups = new Map<string | undefined, MultiSelectOption<T>[]>();
  for (const option of options) {
    const members = groups.get(option.group) ?? [];
    members.push(option);
    groups.set(option.group, members);
  }
  return Array.from(groups.entries());
}

export function MultiSelectFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        {label}
      </button>
      {isOpen && (
        <div role="menu" aria-label={label}>
          {groupsOf(options).map(([group, groupOptions]) => (
            <div
              key={group ?? ''}
              role={group === undefined ? undefined : 'group'}
              aria-label={group}
            >
              {group !== undefined && <div aria-hidden="true">{group}</div>}
              {groupOptions.map((o) => (
                <div
                  key={o.value}
                  role="menuitemcheckbox"
                  aria-checked={selected.includes(o.value)}
                  tabIndex={-1}
                  onClick={() => toggle(o.value)}
                  onKeyDown={(e) => e.key === 'Enter' && toggle(o.value)}
                >
                  {o.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
