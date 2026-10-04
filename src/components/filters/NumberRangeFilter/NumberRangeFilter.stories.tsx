import type { Story } from '@ladle/react';
import { useState } from 'react';
import { NumberRangeFilter } from './index';

function Controlled({
  label,
  initialMin,
  initialMax,
  dataMin,
  dataMax,
}: {
  label: string;
  initialMin?: number;
  initialMax?: number;
  dataMin?: number | null;
  dataMax?: number | null;
}) {
  const [min, setMin] = useState<number | undefined>(initialMin);
  const [max, setMax] = useState<number | undefined>(initialMax);
  return (
    <div className="space-y-3 min-h-40">
      <NumberRangeFilter
        label={label}
        min={min}
        max={max}
        dataMin={dataMin}
        dataMax={dataMax}
        onChangeMin={setMin}
        onChangeMax={setMax}
      />
      <p className="text-xs text-text-muted font-mono">
        min: <span className="text-text-secondary">{min ?? 'undefined'}</span> max:{' '}
        <span className="text-text-secondary">{max ?? 'undefined'}</span>
      </p>
    </div>
  );
}

export const Inactive: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Size" />
  </div>
);

export const DataRangeHints: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Year" dataMin={1990} dataMax={2024} />
  </div>
);

export const Active: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Year" initialMin={2000} initialMax={2010} />
  </div>
);

export const OpenEnded: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Rating" initialMin={7} />
  </div>
);
