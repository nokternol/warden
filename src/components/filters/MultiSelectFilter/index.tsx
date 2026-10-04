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
// focus to the trigger (Escape also closes the menu). Focus leaving the control,
// by Tab or otherwise, closes it too; the menu itself is focusable so a press on
// its non-option areas (headings, the note) keeps focus inside.
//
// When the selection reaches into more than one group, `spanNote` is shown in
// the menu footer so the caller can explain how such a selection is read.
//
// While anything is selected the menu ends with a "Clear selection" item, the
// last stop in the same keyboard order; choosing it emits an empty selection
// and returns focus to the trigger. The note and the clear item sit in a footer
// outside the scrolling option list, so they stay in view however long the
// list is.

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
  /** Explains a selection that spans several groups; shown only while it does. */
  spanNote?: string;
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
  spanNote,
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

  const selectedGroups = new Set(
    options.filter((option) => selected.includes(option.value)).map((option) => option.group)
  );
  const spansGroups = selectedGroups.size > 1;
  const hasClearItem = activeCount > 0;
  const itemCount = renderOrder.length + (hasClearItem ? 1 : 0);

  const clearSelection = () => {
    onChange([]);
    closeToTrigger();
  };

  const onItemKeyDown = (e: React.KeyboardEvent, index: number, activate: () => void) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeToTrigger();
        break;
      case 'ArrowDown':
        e.preventDefault();
        itemRefs.current[Math.min(index + 1, itemCount - 1)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index === 0) triggerRef.current?.focus();
        else itemRefs.current[index - 1]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate();
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setIsOpen(false);
      }}
    >
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
          tabIndex={-1}
          className="absolute top-full left-0 mt-1 min-w-40 max-h-60 focus:outline-none flex flex-col overflow-hidden bg-surface-panel border border-border rounded-lg shadow-lg py-1 z-20"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                      onKeyDown={(e) => onItemKeyDown(e, index, () => toggle(option.value))}
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
          {spansGroups && spanNote && (
            <div
              role="note"
              className="border-t border-border mt-1 px-3 pt-2 pb-1.5 text-[11px] leading-snug text-text-muted"
            >
              {spanNote}
            </div>
          )}
          {hasClearItem && (
            <div
              ref={(el) => {
                itemRefs.current[renderOrder.length] = el;
              }}
              role="menuitem"
              tabIndex={-1}
              onClick={clearSelection}
              onKeyDown={(e) => onItemKeyDown(e, renderOrder.length, clearSelection)}
              className="border-t border-border mt-1 px-3 py-2.5 text-xs text-text-secondary hover:bg-surface-hover focus:bg-surface-hover focus:outline-none cursor-pointer select-none"
            >
              Clear selection
            </div>
          )}
        </div>
      )}
    </div>
  );
}
