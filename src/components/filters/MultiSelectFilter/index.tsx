import { cn } from '@app/lib/utils/cn';
import { useEffect, useId, useRef, useState } from 'react';

// ─── MultiSelectFilter ────────────────────────────────────────────────────────
//
// Compact dropdown that picks any number of values for one rule. It owns only
// presentation and keyboard behaviour: it takes the selection as an array and
// emits the next array, so callers decide how that selection is stored.
//
// Options that carry a `group` render under that heading (used to qualify an
// option by the instance it belongs to).
//
// Keyboard: ArrowDown on the trigger opens the menu and focuses the first
// option; ArrowDown/ArrowUp move between options across groups; Space/Enter
// toggle the focused option; ArrowUp from the first option or Escape returns
// focus to the trigger (Escape also closes the menu).

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
  const id = useId();
  const menuId = `${id}-menu`;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideMouseDown);
    return () => document.removeEventListener('mousedown', closeOnOutsideMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) itemRefs.current[0]?.focus();
  }, [isOpen]);

  if (options.length === 0) return null;

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const groups = groupsOf(options);
  // Keyboard indices follow the order the menu renders, which groups can reorder.
  const renderOrder = groups.flatMap(([, members]) => members);
  const indexOf = new Map(renderOrder.map((option, index) => [option.value, index]));
  const activeCount = selected.length;

  const closeToTrigger = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (isOpen) itemRefs.current[0]?.focus();
      else setIsOpen(true);
    } else if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const onOptionKeyDown = (e: React.KeyboardEvent, option: MultiSelectOption<T>, index: number) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeToTrigger();
        break;
      case 'ArrowDown':
        e.preventDefault();
        itemRefs.current[Math.min(index + 1, renderOrder.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) triggerRef.current?.focus();
        else itemRefs.current[index - 1]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        toggle(option.value);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={activeCount > 0 ? `${label}, ${activeCount} selected` : label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium border transition-colors h-7',
          activeCount > 0
            ? 'bg-primary text-white border-primary'
            : 'bg-surface-panel text-text-secondary border-border hover:bg-surface-hover'
        )}
      >
        {label}
        {activeCount > 0 && (
          <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs" aria-hidden="true">
            {activeCount}
          </span>
        )}
        <svg
          className="w-3 h-3 ml-0.5"
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
          role="menu"
          id={menuId}
          aria-label={label}
          className="absolute top-full left-0 mt-1 min-w-40 max-h-60 overflow-y-auto bg-surface-panel border border-border rounded-lg shadow-lg py-1 z-20"
        >
          {groups.map(([group, members]) => (
            <div
              key={group ?? ''}
              role={group === undefined ? undefined : 'group'}
              aria-label={group}
            >
              {group !== undefined && (
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted select-none first:pt-1.5"
                  aria-hidden="true"
                >
                  {group}
                </div>
              )}
              {members.map((option) => {
                const index = indexOf.get(option.value) ?? 0;
                const checked = selected.includes(option.value);
                return (
                  <div
                    key={`${id}-${option.value}`}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    tabIndex={-1}
                    onClick={() => toggle(option.value)}
                    onKeyDown={(e) => onOptionKeyDown(e, option, index)}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-surface-hover focus:bg-surface-hover focus:outline-none cursor-pointer select-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'w-3.5 h-3.5 flex-shrink-0 rounded-sm border flex items-center justify-center',
                        checked ? 'bg-primary border-primary' : 'border-border bg-surface-bg'
                      )}
                    >
                      {checked && (
                        <svg
                          viewBox="0 0 12 12"
                          fill="none"
                          className="w-full h-full p-0.5"
                          aria-hidden="true"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    {option.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
