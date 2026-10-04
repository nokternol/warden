import type { Story } from '@ladle/react';
import { useState } from 'react';
import { TextFilter } from './index';

function Controlled({ label, initial }: { label: string; initial?: string }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <div className="space-y-3">
      <TextFilter label={label} value={value} onChange={setValue} />
      <p className="text-xs text-text-muted font-mono">
        value: <span className="text-text-secondary">{JSON.stringify(value) ?? 'undefined'}</span>
      </p>
    </div>
  );
}

export const Empty: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Certification" />
  </div>
);

export const WithValue: Story = () => (
  <div className="bg-surface-bg p-8">
    <Controlled label="Certification" initial="PG-13" />
  </div>
);
