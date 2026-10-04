import type { Story } from '@ladle/react';
import { useState } from 'react';
import { MultiSelectFilter, type MultiSelectOption } from './index';

// ─── Controlled wrapper ───────────────────────────────────────────────────────

function Controlled<T extends string | number>({
  label,
  options,
  initial = [],
  spanNote,
}: {
  label: string;
  options: MultiSelectOption<T>[];
  initial?: T[];
  spanNote?: string;
}) {
  const [selected, setSelected] = useState<T[]>(initial);
  return (
    <div className="space-y-3">
      <MultiSelectFilter
        label={label}
        options={options}
        selected={selected}
        onChange={setSelected}
        spanNote={spanNote}
      />
      <p className="text-xs text-text-muted font-mono">
        selected: <span className="text-text-secondary">{JSON.stringify(selected)}</span>
      </p>
    </div>
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GENRES = ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'].map((g) => ({
  value: g,
  label: g,
}));

const MANY = Array.from({ length: 40 }, (_, i) => ({
  value: `Release group ${i + 1}`,
  label: `Release group ${i + 1}`,
}));

const TAGS_ONE_INSTANCE = [
  { value: 1, label: '4K' },
  { value: 2, label: 'Remux' },
  { value: 3, label: 'Kids' },
];

const TAGS_TWO_INSTANCES = [
  { value: 10, label: '4K', group: 'Radarr 4K' },
  { value: 11, label: 'Remux', group: 'Radarr 4K' },
  { value: 12, label: 'HDR', group: 'Radarr 4K' },
  { value: 20, label: 'Kids', group: 'Radarr Standard' },
  { value: 21, label: 'Anime', group: 'Radarr Standard' },
];

const SPANS_NOTE = "Spans multiple instances — matches within each item's own instance.";

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = () => (
  <div className="bg-surface-bg p-8 min-h-80">
    <Controlled label="Genres" options={GENRES} />
  </div>
);

export const WithSelection: Story = () => (
  <div className="bg-surface-bg p-8 min-h-80">
    <Controlled label="Genres" options={GENRES} initial={['Drama', 'Sci-Fi']} />
  </div>
);

export const NumericIds: Story = () => (
  <div className="bg-surface-bg p-8 min-h-64">
    <Controlled label="Movie Tags" options={TAGS_ONE_INSTANCE} initial={[2]} />
  </div>
);

/** Several instances: options sit under their instance heading, and a selection
 *  reaching into more than one instance shows the caller's note. */
export const GroupedByInstance: Story = () => (
  <div className="bg-surface-bg p-8 min-h-96">
    <Controlled
      label="Movie Tags"
      options={TAGS_TWO_INSTANCES}
      initial={[10, 20]}
      spanNote={SPANS_NOTE}
    />
  </div>
);

export const ScrollingList: Story = () => (
  <div className="bg-surface-bg p-8 min-h-96">
    <Controlled label="Release Group" options={MANY} initial={['Release group 3']} />
  </div>
);

export const OnFilterBarPanel: Story = () => (
  <div className="bg-surface-panel border-b border-border px-6 py-2 min-h-80">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Controlled label="Genres" options={GENRES} initial={['Crime']} />
      <Controlled label="Movie Tags" options={TAGS_TWO_INSTANCES} spanNote={SPANS_NOTE} />
    </div>
  </div>
);
