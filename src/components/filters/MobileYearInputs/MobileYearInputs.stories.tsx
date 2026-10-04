import type { Story } from '@ladle/react';
import { useState } from 'react';
import { MobileYearInputs } from './index';

function Controlled({ initialMin, initialMax }: { initialMin?: number; initialMax?: number }) {
  const [yearMin, setYearMin] = useState<number | undefined>(initialMin);
  const [yearMax, setYearMax] = useState<number | undefined>(initialMax);
  return (
    <div className="space-y-3 max-w-sm">
      <MobileYearInputs
        yearMin={yearMin}
        yearMax={yearMax}
        globalMin={1990}
        globalMax={2024}
        setYearMin={setYearMin}
        setYearMax={setYearMax}
      />
      <p className="text-xs text-text-muted font-mono">
        yearMin: <span className="text-text-secondary">{yearMin ?? 'undefined'}</span> yearMax:{' '}
        <span className="text-text-secondary">{yearMax ?? 'undefined'}</span>
      </p>
    </div>
  );
}

export const Empty: Story = () => (
  <div className="bg-surface-panel p-6">
    <Controlled />
  </div>
);

export const WithRange: Story = () => (
  <div className="bg-surface-panel p-6">
    <Controlled initialMin={2000} initialMax={2010} />
  </div>
);
