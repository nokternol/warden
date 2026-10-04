import type {
  ContentScope,
  FilterState,
  FilterValue,
  QualifierScope,
  RangeValue,
} from '@app/hooks/useMediaFilters';
import { scopeOf } from '@app/hooks/useMediaFilters';
import type { MediaQualityProfile, MediaTag } from '@app/hooks/useMediaLookups';
import type { MediaRuleDescriptor } from '@app/hooks/useMediaRules';
import type { MediaSourceDescriptor } from '@app/hooks/useMediaSources';
import { cn } from '@app/lib/utils/cn';
import type { ContentType } from '@contract/schemas';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { OptionFilter } from '../filters/OptionFilter';
import type { PickerEntry } from './FilterPicker';
import { FilterPicker } from './FilterPicker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearRange {
  min: number | null;
  max: number | null;
}

interface Lookups {
  tags: { radarr: MediaTag[]; sonarr: MediaTag[] };
  qualityProfiles: { radarr: MediaQualityProfile[]; sonarr: MediaQualityProfile[] };
  genres: { movies: string[]; series: string[] };
  networks: string[];
  studio: string[];
  fileContainers: string[];
  videoCodecs: string[];
  audioCodecs: string[];
  fileResolutions: string[];
  labels: string[];
  releaseGroups: string[];
  collectionNames: string[];
  languageProfiles: MediaQualityProfile[];
}

export interface MediaFilterBarProps {
  /** Provider- and content-type-gated rule descriptors from `useMediaRules()` — the single source of what controls exist. */
  rules: MediaRuleDescriptor[];
  values: FilterState;
  onRuleChange: (scope: ContentScope, key: string, value: FilterValue | undefined) => void;
  /** Sets the instance qualification for an `instanceScoped` rule's current value (§10) —
   *  called alongside `onRuleChange` whenever a grouped, per-instance control changes. */
  onQualifierChange: (scope: QualifierScope, key: string, providerId: number | undefined) => void;
  clearAll: () => void;
  onSaveQuery?: () => void;
  isActive: boolean;
  movieYearRange: YearRange | null;
  seriesYearRange: YearRange | null;
  lookups: Lookups;
  /** Active-instance counts per content type — drives grouped, instance-qualified rendering
   *  for `instanceScoped` rules (§10). With zero or one instance every rule renders exactly
   *  as it did before this existed. */
  sources?: Record<ContentType, MediaSourceDescriptor>;
  /** Scopes visible filter groups to the active tab. Omit to show all. */
  activeTab?: 'movies' | 'series';
  /** Mobile bottom sheet open state */
  mobileOpen?: boolean;
  /** Callback to close the mobile bottom sheet */
  onMobileClose?: () => void;
}

// ─── FilterGroup ──────────────────────────────────────────────────────────────
//
// Labeled container for one section of rules, headed by the section heading the
// rules' descriptors name. Keeps a section's controls together when the bar wraps.

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-divider bg-surface-bg/40 px-2.5 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap select-none">
        {label}
      </span>
      <span className="h-4 w-px bg-divider flex-shrink-0" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

// ─── ChipX — clear icon for the active-condition chips ────────────────────────

function ChipX() {
  return (
    <svg
      viewBox="0 0 10 10"
      className="w-2.5 h-2.5 flex-shrink-0 opacity-70"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

// ─── MultiSelectDropdown ──────────────────────────────────────────────────────

interface QualifiableOption {
  id: number;
  displayName: string;
  providerId: number;
  providerName: string;
}

/** Groups options by `providerId`, preserving each group's first-seen order —
 *  the shape a grouped dropdown menu renders as labeled sections. */
function groupByProvider(options: QualifiableOption[]): Array<[string, QualifiableOption[]]> {
  const groups = new Map<string, QualifiableOption[]>();
  for (const opt of options) {
    const key = opt.providerName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(opt);
  }
  return Array.from(groups.entries());
}

/** The single providerId every selected option shares, or `undefined` if the
 *  selection spans zero or more than one instance — mixed/empty selections
 *  fall back to today's unqualified interpretation (native id space of each
 *  item's own instance), the same degrade the design document accepts for
 *  cross-instance picks that can't be qualified to one namespace. */
function providerIdOf(options: QualifiableOption[], selectedIds: number[]): number | undefined {
  const providerIds = new Set(
    options.filter((o) => selectedIds.includes(o.id)).map((o) => o.providerId)
  );
  return providerIds.size === 1 ? Array.from(providerIds)[0] : undefined;
}

function MultiSelectDropdown({
  label,
  options,
  selectedIds,
  onChange,
  grouped = false,
}: {
  label: string;
  options: Array<{ id: number; displayName: string; providerId?: number; providerName?: string }>;
  selectedIds: number[];
  onChange: (ids: number[], providerId: number | undefined) => void;
  /** Renders options in labeled per-instance sections and reports the
   *  qualified `providerId` on every change — set when the owning content
   *  type has more than one active instance (see `MediaFilterBar`). */
  grouped?: boolean;
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      itemRefs.current[0]?.focus();
    }
  }, [isOpen]);

  if (options.length === 0) return null;

  const qualifiable = options as QualifiableOption[];

  const toggle = (optId: number) => {
    const next = selectedIds.includes(optId)
      ? selectedIds.filter((x) => x !== optId)
      : [...selectedIds, optId];
    onChange(next, grouped ? providerIdOf(qualifiable, next) : undefined);
  };

  const activeCount = selectedIds.length;
  const menuGroups = grouped ? groupByProvider(qualifiable) : null;
  // Flattened in the same order the menu renders (grouped or not) so
  // keyboard-nav indices line up with the labeled sections below.
  const renderOrder = menuGroups ? menuGroups.flatMap(([, opts]) => opts) : options;
  const indexById = new Map(renderOrder.map((opt, index) => [opt.id, index]));

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={activeCount > 0 ? `${label}, ${activeCount} selected` : label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            setIsOpen(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) setIsOpen(true);
            else itemRefs.current[0]?.focus();
          } else if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
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
          {(menuGroups ?? ([[undefined, options]] as const)).map(([providerName, groupOptions]) => (
            <div key={providerName ?? 'ungrouped'}>
              {providerName !== undefined && (
                <div
                  className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted select-none first:pt-1.5"
                  aria-hidden="true"
                >
                  {providerName}
                </div>
              )}
              {groupOptions.map((opt) => {
                const index = indexById.get(opt.id)!;
                const checked = selectedIds.includes(opt.id);
                return (
                  <div
                    key={`${id}-${opt.id}`}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    tabIndex={-1}
                    onClick={() => toggle(opt.id)}
                    onKeyDown={(e) => {
                      switch (e.key) {
                        case 'Escape':
                          e.preventDefault();
                          setIsOpen(false);
                          triggerRef.current?.focus();
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
                          toggle(opt.id);
                          break;
                      }
                    }}
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
                    {opt.displayName}
                  </div>
                );
              })}
            </div>
          ))}
          {grouped &&
            selectedIds.length > 0 &&
            providerIdOf(qualifiable, selectedIds) === undefined && (
              <div
                role="note"
                className="border-t border-border mt-1 px-3 pt-2 pb-1.5 text-[11px] leading-snug text-text-muted"
              >
                Spans multiple instances — matches within each item&apos;s own instance.
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function StringMultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      itemRefs.current[0]?.focus();
    }
  }, [isOpen]);

  if (options.length === 0) return null;

  const toggle = (value: string) => {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((x) => x !== value)
      : [...selectedValues, value];
    onChange(next);
  };

  const activeCount = selectedValues.length;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={activeCount > 0 ? `${label}, ${activeCount} selected` : label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            setIsOpen(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) setIsOpen(true);
            else itemRefs.current[0]?.focus();
          } else if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
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
          {options.map((opt, index) => {
            const checked = selectedValues.includes(opt);
            return (
              <div
                key={`${id}-${opt}`}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                role="menuitemcheckbox"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => toggle(opt)}
                onKeyDown={(e) => {
                  switch (e.key) {
                    case 'Escape':
                      e.preventDefault();
                      setIsOpen(false);
                      triggerRef.current?.focus();
                      break;
                    case 'ArrowDown':
                      e.preventDefault();
                      itemRefs.current[Math.min(index + 1, options.length - 1)]?.focus();
                      break;
                    case 'ArrowUp':
                      e.preventDefault();
                      if (index === 0) triggerRef.current?.focus();
                      else itemRefs.current[index - 1]?.focus();
                      break;
                    case 'Enter':
                    case ' ':
                      e.preventDefault();
                      toggle(opt);
                      break;
                  }
                }}
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
                {opt}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── TextFilter — a free-text rule (a `string` rule with no fixed options) ───

function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="px-2.5 py-1 rounded-md text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary w-36"
    />
  );
}

// ─── NumberRangeFilter ────────────────────────────────────────────────────────

function parseNumber(s: string): number | undefined {
  const n = Number.parseFloat(s);
  return s.trim() === '' || Number.isNaN(n) ? undefined : n;
}

function NumberRangeFilter({
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

// ─── Mobile year inputs — better UX on touch than a 144px slider ──────────────

function MobileYearInputs({
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCsvIds(csv: string | undefined): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function toCsvOrUndefined(ids: number[]): string | undefined {
  return ids.length > 0 ? ids.join(',') : undefined;
}

function parseCsvStrings(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toStringCsvOrUndefined(values: string[]): string | undefined {
  return values.length > 0 ? values.join(',') : undefined;
}

// ─── Rule grouping — the descriptor names its section heading ───────────────
//
// Each rule renders under its descriptor's `group` heading, in the order the
// headings first appear in `rules`. Rules with no group ('title', 'year') are
// the universal controls rendered outside every section. The active tab hides
// rules scoped to the other content type; shared rules show on both tabs.

interface ScopedRule {
  rule: MediaRuleDescriptor;
  scope: ContentScope;
}

type RuleSection = [heading: string, entries: ScopedRule[]];

function tabShows(scope: ContentScope, activeTab: MediaFilterBarProps['activeTab']): boolean {
  if (activeTab === undefined || scope === 'shared') return true;
  return activeTab === (scope === 'movie' ? 'movies' : 'series');
}

function sectionsOf(
  rules: MediaRuleDescriptor[],
  activeTab: MediaFilterBarProps['activeTab']
): RuleSection[] {
  const sections = new Map<string, ScopedRule[]>();
  for (const rule of rules) {
    const scope = scopeOf(rule);
    if (!rule.group || !tabShows(scope, activeTab)) continue;
    if (!sections.has(rule.group)) sections.set(rule.group, []);
    sections.get(rule.group)!.push({ rule, scope });
  }
  return Array.from(sections.entries());
}

// ─── Per-value display — read from the descriptor ─────────────────────────────

function booleanOptions(rule: MediaRuleDescriptor) {
  const labels = rule.valueLabels ?? { true: 'Yes', false: 'No' };
  return [
    { value: 'true' as const, label: labels.true },
    { value: 'false' as const, label: labels.false },
  ];
}

// instance-ids / csv-strings rules need an option *list*. The values are library
// data (tags, profiles, genres, codecs …), so the descriptor names the `lookup`
// they come from rather than carrying them. Lookups served once per source type
// (Radarr for movies, Sonarr for series) are picked by the rule's content scope.

function bySource<T>(pair: { radarr: T; sonarr: T }, scope: ContentScope): T {
  return scope === 'movie' ? pair.radarr : pair.sonarr;
}

function tagOption(t: MediaTag): QualifiableOption {
  return { id: t.id, displayName: t.label, providerId: t.providerId, providerName: t.providerName };
}

function profileOption(p: MediaQualityProfile): QualifiableOption {
  return { id: p.id, displayName: p.name, providerId: p.providerId, providerName: p.providerName };
}

function idOptions(
  rule: MediaRuleDescriptor,
  scope: ContentScope,
  lookups: Lookups
): QualifiableOption[] | null {
  switch (rule.lookup) {
    case 'tags':
      return bySource(lookups.tags, scope).map(tagOption);
    case 'qualityProfiles':
      return bySource(lookups.qualityProfiles, scope).map(profileOption);
    case 'languageProfiles':
      return lookups.languageProfiles.map(profileOption);
    default:
      return null;
  }
}

/** Whether the rule's owning content type currently has more than one active
 *  instance — the trigger for grouped, instance-qualified rendering (§10). */
function hasMultipleInstances(
  scope: ContentScope,
  sources: Record<ContentType, MediaSourceDescriptor> | undefined
): boolean {
  if (scope === 'shared') return false;
  return (sources?.[scope]?.instances.length ?? 0) > 1;
}

function stringOptions(
  rule: MediaRuleDescriptor,
  scope: ContentScope,
  lookups: Lookups
): string[] | null {
  switch (rule.lookup) {
    case undefined:
    case 'tags':
    case 'qualityProfiles':
    case 'languageProfiles':
      return null;
    case 'genres':
      return scope === 'movie' ? lookups.genres.movies : lookups.genres.series;
    default:
      return lookups[rule.lookup];
  }
}

/** Mirrors RuleControl's switch: true only for a rule/scope RuleControl would
 *  actually render something for. `string`/`number` rules with no `options` and `instance-ids`/`csv-strings` rules with no lookup source (e.g.
 *  `certification` today) render null — FilterPicker must not offer those, or
 *  "adding" one produces a labeled group with nothing inside it. */
function ruleRendersControl(
  rule: MediaRuleDescriptor,
  scope: ContentScope,
  lookups: Lookups
): boolean {
  switch (rule.dataType) {
    case 'range':
    case 'boolean':
      return true;
    case 'string':
      return true;
    case 'number':
      return rule.options !== undefined;
    case 'instance-ids':
      return idOptions(rule, scope, lookups) !== null;
    case 'csv-strings':
      return stringOptions(rule, scope, lookups) !== null;
    default:
      return false;
  }
}

// ─── Value access + range collapse ────────────────────────────────────────────

function readRangeBound(
  values: FilterState,
  scope: ContentScope,
  key: string,
  bound: 'min' | 'max'
) {
  return (values[scope][key] as RangeValue | undefined)?.[bound];
}

/** Collapses `{min: undefined, max: undefined}` back to `undefined` — the server rejects a range value with no bound set, so "clear both" must remove the key, not persist an empty object. */
function rangePatch(
  current: RangeValue | undefined,
  bound: 'min' | 'max',
  value: number | undefined
) {
  const next = { ...current, [bound]: value };
  return next.min === undefined && next.max === undefined ? undefined : next;
}

// ─── Active-condition formatting — one entry per active rule, generically ────

function formatRangeLabel(rule: MediaRuleDescriptor, value: RangeValue, suffix = ''): string {
  const fmt = (v: number | undefined) => (v !== undefined ? String(v) : '…');
  return `${rule.label} ${fmt(value.min)}–${fmt(value.max)}${suffix}`;
}

function conditionLabel(rule: MediaRuleDescriptor, value: FilterValue): string | null {
  switch (rule.dataType) {
    case 'range':
      return formatRangeLabel(rule, value as RangeValue);
    case 'boolean': {
      const opt = booleanOptions(rule).find((o) => o.value === value);
      return opt?.label ?? null;
    }
    case 'string':
    case 'number': {
      const options = rule.options;
      const strValue = String(value);
      return options ? (options.find((o) => o.value === strValue)?.label ?? null) : strValue;
    }
    case 'instance-ids':
    case 'csv-strings': {
      const count = String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length;
      return count > 0 ? `${rule.label} · ${count}` : null;
    }
    default:
      return null;
  }
}

function isValueActive(value: FilterValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'object') return value.min !== undefined || value.max !== undefined;
  return true;
}

// ─── Generic control ──────────────────────────────────────────────────────────
//
// One control per rule, chosen by `dataType`. Grouping decides *where* a rule
// renders; this decides *what* renders. `variant` mirrors OptionFilter's
// desktop/mobile split.

function RuleControl({
  rule,
  scope,
  values,
  onRuleChange,
  onQualifierChange,
  lookups,
  sources,
  variant = 'segment',
  dataMin,
  dataMax,
}: {
  rule: MediaRuleDescriptor;
  scope: ContentScope;
  values: FilterState;
  onRuleChange: MediaFilterBarProps['onRuleChange'];
  onQualifierChange: MediaFilterBarProps['onQualifierChange'];
  lookups: Lookups;
  sources: MediaFilterBarProps['sources'];
  variant?: 'segment' | 'chips';
  dataMin?: number | null;
  dataMax?: number | null;
}) {
  const value = values[scope][rule.key];

  switch (rule.dataType) {
    case 'range':
      return (
        <NumberRangeFilter
          label={rule.label}
          min={readRangeBound(values, scope, rule.key, 'min')}
          max={readRangeBound(values, scope, rule.key, 'max')}
          dataMin={dataMin}
          dataMax={dataMax}
          onChangeMin={(v) =>
            onRuleChange(scope, rule.key, rangePatch(value as RangeValue | undefined, 'min', v))
          }
          onChangeMax={(v) =>
            onRuleChange(scope, rule.key, rangePatch(value as RangeValue | undefined, 'max', v))
          }
        />
      );

    case 'boolean':
      return (
        <OptionFilter
          variant={variant}
          options={booleanOptions(rule)}
          value={value as 'true' | 'false' | undefined}
          onChange={(v) => onRuleChange(scope, rule.key, v)}
        />
      );

    case 'string':
    case 'number': {
      const options = rule.options;
      if (!options && rule.dataType === 'string') {
        return (
          <TextFilter
            label={rule.label}
            value={value !== undefined ? String(value) : undefined}
            onChange={(v) => onRuleChange(scope, rule.key, v)}
          />
        );
      }
      if (!options) return null;
      const label = rule.shortLabel ?? rule.label;
      const control = (
        <OptionFilter
          variant={variant}
          label={variant === 'segment' ? label : undefined}
          options={options}
          value={value !== undefined ? String(value) : undefined}
          onChange={(v) =>
            onRuleChange(
              scope,
              rule.key,
              v === undefined ? undefined : rule.dataType === 'number' ? Number(v) : v
            )
          }
        />
      );
      // Chips variant has no inline label slot (unlike segment) — mirror the
      // mobile sheet's own labeled-block wrapper so "Standard/Anime/Daily"
      // still reads as "Type: ..." instead of a bare, unexplained chip row.
      if (variant !== 'chips' || !label) return control;
      return (
        <div>
          <span className="text-xs text-text-muted mb-2 block">{label}</span>
          {control}
        </div>
      );
    }

    case 'instance-ids': {
      const options = idOptions(rule, scope, lookups);
      if (!options) return null;
      const grouped = rule.instanceScoped === true && hasMultipleInstances(scope, sources);
      return (
        <MultiSelectDropdown
          label={rule.label}
          options={options}
          selectedIds={parseCsvIds(value as string | undefined)}
          grouped={grouped}
          onChange={(ids, providerId) => {
            onRuleChange(scope, rule.key, toCsvOrUndefined(ids));
            if (rule.instanceScoped && (scope === 'movie' || scope === 'series')) {
              onQualifierChange(scope, rule.key, providerId);
            }
          }}
        />
      );
    }

    case 'csv-strings': {
      const options = stringOptions(rule, scope, lookups);
      if (!options) return null;
      return (
        <StringMultiSelectDropdown
          label={rule.label}
          options={options}
          selectedValues={parseCsvStrings(value as string | undefined)}
          onChange={(v) => onRuleChange(scope, rule.key, toStringCsvOrUndefined(v))}
        />
      );
    }

    default:
      return null;
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MediaFilterBar({
  rules,
  values,
  onRuleChange,
  onQualifierChange,
  clearAll,
  onSaveQuery,
  isActive,
  movieYearRange,
  seriesYearRange,
  lookups,
  sources,
  activeTab,
  mobileOpen = false,
  onMobileClose,
}: MediaFilterBarProps) {
  const availableMins = [movieYearRange?.min, seriesYearRange?.min].filter(
    (v): v is number => v != null
  );
  const availableMaxs = [movieYearRange?.max, seriesYearRange?.max].filter(
    (v): v is number => v != null
  );
  const dataMin: number | null = availableMins.length > 0 ? Math.min(...availableMins) : null;
  const dataMax: number | null = availableMaxs.length > 0 ? Math.max(...availableMaxs) : null;
  const globalMin = dataMin ?? 1888;
  const globalMax = dataMax ?? new Date().getFullYear();

  const titleRule = rules.find((r) => r.key === 'title');
  const yearRule = rules.find((r) => r.key === 'year');

  const sections = useMemo(() => sectionsOf(rules, activeTab), [rules, activeTab]);

  // ─── Add-filter visibility ──────────────────────────────────────────────
  //
  // At ~70 possible fields across providers, rendering every configured rule
  // unconditionally overruns the bar. A rule renders only once it has an
  // active value (existing/deep-linked filters never silently disappear) or
  // the user explicitly added it via FilterPicker. Clearing a filter's value
  // through its own control returns an explicitly-added rule to the pool.
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set());

  const handleRuleChange = (scope: ContentScope, key: string, value: FilterValue | undefined) => {
    onRuleChange(scope, key, value);
    if (value === undefined) {
      setVisibleKeys((prev) => {
        const id = `${scope}:${key}`;
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const isRuleVisible = useCallback(
    (rule: MediaRuleDescriptor, scope: ContentScope): boolean =>
      isValueActive(values[scope][rule.key]) || visibleKeys.has(`${scope}:${rule.key}`),
    [values, visibleKeys]
  );

  const visibleSections = useMemo(
    () =>
      sections
        .map(
          ([heading, entries]): RuleSection => [
            heading,
            entries.filter(({ rule, scope }) => isRuleVisible(rule, scope)),
          ]
        )
        .filter(([, entries]) => entries.length > 0),
    [sections, isRuleVisible]
  );

  const pickerEntries = useMemo(
    () =>
      sections
        .map(([heading, entries]): [string, PickerEntry[]] => [
          heading,
          entries
            .filter(({ rule, scope }) => !isRuleVisible(rule, scope))
            .filter(({ rule, scope }) => ruleRendersControl(rule, scope, lookups))
            .map(({ rule, scope }) => ({ rule, scope, group: heading })),
        ])
        .filter(([, entries]) => entries.length > 0),
    [sections, isRuleVisible, lookups]
  );

  const handlePick = (entry: PickerEntry) => {
    setVisibleKeys((prev) => new Set(prev).add(`${entry.scope}:${entry.rule.key}`));
  };

  const filterPicker =
    pickerEntries.length > 0 ? <FilterPicker entries={pickerEntries} onPick={handlePick} /> : null;

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogHeadingId = useId();
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => {
    onMobileCloseRef.current = onMobileClose;
  });

  useEffect(() => {
    if (mobileOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen || !dialogRef.current) return;
    const sel = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    dialogRef.current.querySelectorAll<HTMLElement>(sel)[0]?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const sel = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(sel));
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onMobileCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  // ─── Shared sub-elements ─────────────────────────────────────────────────

  const searchInput = titleRule ? (
    <div className="relative flex-shrink-0">
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        placeholder="Filter by title…"
        aria-label="Filter by title"
        value={(values.shared.title as string) ?? ''}
        onChange={(e) => onRuleChange('shared', 'title', e.target.value)}
        className="pl-8 pr-3 py-1.5 rounded-md text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary w-44"
      />
    </div>
  ) : null;

  const yearFilter = yearRule ? (
    <RuleControl
      rule={yearRule}
      scope="shared"
      values={values}
      onRuleChange={onRuleChange}
      onQualifierChange={onQualifierChange}
      sources={sources}
      lookups={lookups}
      dataMin={dataMin}
      dataMax={dataMax}
    />
  ) : null;

  const desktopSections = visibleSections.map(([heading, entries]) => (
    <FilterGroup key={heading} label={heading}>
      {entries.map(({ rule, scope }) => (
        <RuleControl
          key={`${scope}:${rule.key}`}
          rule={rule}
          scope={scope}
          values={values}
          onRuleChange={handleRuleChange}
          onQualifierChange={onQualifierChange}
          sources={sources}
          lookups={lookups}
        />
      ))}
    </FilterGroup>
  ));

  // ─── Active conditions — drives the saved-query summary row ───────────────
  // Each active filter becomes one removable chip. The chips are exactly the
  // conditions persisted by "Save as query", so the row makes the
  // filters → saved-query relationship literal. Derived generically from
  // `rules` + `values` rather than one hand-written check per field.

  type Condition = { key: string; label: string; onClear: () => void };
  const activeConditions: Condition[] = [];

  const titleValue = values.shared.title as string;
  if (titleValue) {
    activeConditions.push({
      key: 'title',
      label: `“${titleValue}”`,
      onClear: () => onRuleChange('shared', 'title', ''),
    });
  }

  const seenKeys = new Set<string>();
  for (const rule of rules) {
    if (rule.key === 'title' || seenKeys.has(`${scopeOf(rule)}:${rule.key}`)) continue;
    seenKeys.add(`${scopeOf(rule)}:${rule.key}`);
    const scope = scopeOf(rule);
    const value = values[scope][rule.key];
    if (!isValueActive(value)) continue;
    const label = conditionLabel(rule, value as FilterValue);
    if (!label) continue;
    activeConditions.push({
      key: `${scope}:${rule.key}`,
      label,
      onClear: () => onRuleChange(scope, rule.key, undefined),
    });
  }

  const conditionCount = activeConditions.length;

  const summaryRow = isActive ? (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2">
      {conditionCount > 0 ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-hover whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-hover" aria-hidden="true" />
            Filtering by {conditionCount} {conditionCount === 1 ? 'condition' : 'conditions'}
          </span>
          <span className="h-3.5 w-px bg-border flex-shrink-0" aria-hidden="true" />
          <ul className="flex flex-wrap items-center gap-1.5 min-w-0" aria-label="Active filters">
            {activeConditions.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={c.onClear}
                  aria-label={`Remove filter: ${c.label}`}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 pl-2 pr-1.5 py-0.5 text-[11px] font-medium text-primary-hover hover:bg-primary/20 hover:border-primary/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  {c.label}
                  <ChipX />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="text-xs text-text-muted">Filters active</span>
      )}
      <div className="ml-auto flex items-center gap-3 flex-shrink-0 pl-2">
        {onSaveQuery && (
          <button
            type="button"
            onClick={onSaveQuery}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border border-primary/40 text-primary-hover hover:bg-primary/10 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save as query
          </button>
        )}
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-text-muted hover:text-text-primary transition-colors underline underline-offset-2"
        >
          Clear all
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* ── Desktop filter bar (md+) ─────────────────────────────────────────── */}
      <div
        className="hidden md:block bg-surface-panel border-b border-border px-6 py-2.5"
        role="search"
        aria-label="Filter media library"
      >
        {/* Controls: search + year are library-global; each provider source is a
            labeled group so the bar reads as grouped clusters, not a wrapped sea. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {searchInput}
          {yearFilter}
          {desktopSections}
          {filterPicker}
        </div>
        {summaryRow}
      </div>

      {/* ── Mobile full-screen filter modal (< md) ──────────────────────────── */}
      {mobileOpen && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 md:hidden bg-surface-panel flex flex-col pb-16"
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogHeadingId}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <h2 id={dialogHeadingId} className="text-base font-semibold text-text-primary">
              Filters
            </h2>
            {isActive && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Search */}
            {titleRule && (
              <div>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="search"
                    placeholder="Filter by title…"
                    aria-label="Filter by title"
                    value={(values.shared.title as string) ?? ''}
                    onChange={(e) => onRuleChange('shared', 'title', e.target.value)}
                    className="w-full pl-10 pr-3 py-3 rounded-lg text-sm bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {visibleSections.map(([heading, entries]) => (
              <div key={heading}>
                <h3 className="text-sm font-semibold text-text-secondary mb-3">{heading}</h3>
                <div className="space-y-3">
                  {entries.map(({ rule, scope }) => (
                    <RuleControl
                      key={`${scope}:${rule.key}`}
                      rule={rule}
                      scope={scope}
                      values={values}
                      onRuleChange={handleRuleChange}
                      onQualifierChange={onQualifierChange}
                      sources={sources}
                      lookups={lookups}
                      variant={
                        rule.dataType === 'boolean' ||
                        rule.dataType === 'string' ||
                        rule.dataType === 'number'
                          ? 'chips'
                          : 'segment'
                      }
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Add filter */}
            {filterPicker && (
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3">Add filter</h3>
                {filterPicker}
              </div>
            )}

            {/* Year section */}
            {yearRule && (
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3">Year Range</h3>
                <MobileYearInputs
                  yearMin={readRangeBound(values, 'shared', 'year', 'min')}
                  yearMax={readRangeBound(values, 'shared', 'year', 'max')}
                  globalMin={globalMin}
                  globalMax={globalMax}
                  setYearMin={(v) =>
                    onRuleChange(
                      'shared',
                      'year',
                      rangePatch(values.shared.year as RangeValue | undefined, 'min', v)
                    )
                  }
                  setYearMax={(v) =>
                    onRuleChange(
                      'shared',
                      'year',
                      rangePatch(values.shared.year as RangeValue | undefined, 'max', v)
                    )
                  }
                />
              </div>
            )}
          </div>

          {/* Sticky Done footer */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border">
            <button
              type="button"
              onClick={onMobileClose}
              className="w-full py-3 rounded-sm bg-primary text-white font-semibold text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
