import type { ContentScope } from '@app/hooks/useMediaFilters';
import { cn } from '@app/lib/utils/cn';
import type { MediaRuleDescriptor } from '@contract/media';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// ─── FilterPicker ───────────────────────────────────────────────────────────
//
// "Add filter" trigger + grouped, searchable menu. Lets a rule count that
// scales to ~70 fields stay off the bar until a user actually wants it,
// instead of every configured rule rendering unconditionally (the crowding
// problem this replaces). Native <popover> gives light-dismiss, top-layer
// stacking, and escapes any ancestor overflow clipping with no z-index or
// portal bookkeeping.

export interface PickerEntry {
  rule: MediaRuleDescriptor;
  scope: ContentScope;
  group: string;
}

export interface FilterPickerProps {
  /** Rules not currently visible on the bar, grouped by the same section labels FilterGroup uses. */
  entries: Array<[string, PickerEntry[]]>;
  onPick: (entry: PickerEntry) => void;
}

/** React 18's JSX types predate the Popover API's `popovertarget` attribute. */
interface PopoverTargetAttr {
  popovertarget: string;
}

let pickerInstanceCount = 0;

export function FilterPicker({ entries, onPick }: FilterPickerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const popoverId = useMemo(() => `filter-picker-${++pickerInstanceCount}`, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = entries
      .map(([label, groupEntries]): [string, PickerEntry[]] => [
        label,
        q ? groupEntries.filter((e) => e.rule.label.toLowerCase().includes(q)) : groupEntries,
      ])
      .filter(([, groupEntries]) => groupEntries.length > 0);
    return groups;
  }, [entries, query]);

  const flat = useMemo(() => filtered.flatMap(([, groupEntries]) => groupEntries), [filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(Math.max(0, flat.length - 1));
  }, [flat.length, activeIndex]);

  if (entries.length === 0) return null;

  const totalHidden = entries.reduce((sum, [, e]) => sum + e.length, 0);

  // React 18 doesn't wire up `onToggle` for popovers (that lands in React
  // 19) — attach the native event directly. Also positions the popover:
  // CSS anchor positioning isn't universally supported yet (Chrome/Edge
  // 125+ only), so this reads the trigger's own rect instead, and the UA
  // stylesheet's `[popover] { inset: 0 }` default means all four sides need
  // an explicit override, not just top/left.
  useEffect(() => {
    const popover = popoverRef.current;
    const trigger = triggerRef.current;
    if (!popover || !trigger) return;

    const onToggleEvent = (e: Event) => {
      const toggleEvent = e as Event & { newState: string };
      if (toggleEvent.newState !== 'open') return;
      setQuery('');
      setActiveIndex(0);

      const rect = trigger.getBoundingClientRect();
      const width = 288; // w-72
      const overflowsRight = rect.left + width > window.innerWidth - 8;
      popover.style.position = 'fixed';
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = overflowsRight
        ? `${Math.max(8, rect.right - width)}px`
        : `${rect.left}px`;
      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
      popover.style.margin = '0';

      // Popover opens before the DOM settles focus; defer to next tick.
      requestAnimationFrame(() => searchRef.current?.focus());
    };

    popover.addEventListener('toggle', onToggleEvent);
    return () => popover.removeEventListener('toggle', onToggleEvent);
  }, []);

  const pick = (entry: PickerEntry) => {
    onPick(entry);
    // Guarded: not every test/render environment implements the Popover API.
    popoverRef.current?.hidePopover?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flat[activeIndex];
      if (entry) pick(entry);
    }
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        {...({ popovertarget: popoverId } as PopoverTargetAttr)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border border-dashed border-border text-text-secondary hover:border-primary hover:text-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add filter
        <span className="text-text-muted font-normal">{totalHidden}</span>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="w-72 max-h-96 overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg p-0 text-text-primary"
        aria-label="Add filter"
      >
        <div className="sticky top-0 bg-surface-elevated border-b border-border p-2">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search filters…"
            aria-label="Search filters"
            aria-controls={listboxId}
            aria-activedescendant={
              flat[activeIndex] ? optionId(popoverId, flat[activeIndex]) : undefined
            }
            role="combobox"
            aria-expanded="true"
            className="w-full px-2 py-1.5 rounded-sm text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {/* Combobox pattern (biome.json override disables useFocusableInteractive here):
            focus stays on the search input above; aria-activedescendant, not DOM focus,
            tracks the highlighted option. */}
        <div id={listboxId} role="listbox" aria-label="Available filters" className="p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-text-muted text-center">
              No filters match “{query}”
            </p>
          ) : (
            filtered.map(([label, groupEntries]) => (
              <div key={label} className="mb-1 last:mb-0">
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted select-none">
                  {label}
                </div>
                {groupEntries.map((entry) => {
                  const flatIndex = flat.indexOf(entry);
                  const isActive = flatIndex === activeIndex;
                  return (
                    <button
                      key={`${entry.scope}:${entry.rule.key}:${label}`}
                      id={optionId(popoverId, entry)}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={() => pick(entry)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-sm text-xs transition-colors',
                        isActive
                          ? 'bg-primary/15 text-primary-hover'
                          : 'text-text-secondary hover:bg-surface-hover'
                      )}
                    >
                      {entry.rule.label}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function optionId(popoverId: string, entry: PickerEntry): string {
  return `${popoverId}-opt-${entry.scope}-${entry.rule.key}`;
}
