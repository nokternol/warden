import type { AutomationDto } from '@app/hooks/useAutomations';
import type { Story } from '@ladle/react';
import { useEffect, useRef } from 'react';
import AutomationRow from './index';

const automation: AutomationDto = {
  id: 1,
  name: 'Archive old movies',
  kind: 'user',
  query: { id: 1, name: 'Stale Movies', contentType: 'movie' },
  querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
  provider: { id: 1, name: 'Radarr', type: 'RADARR' },
  taskId: 'deleteMovieWithFiles',
  schedule: '0 2 * * *',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  lastRun: { at: '2024-01-01T00:00:00Z', status: 'success', itemCount: 12 },
};

const noop = () => {};
const neverResolves = () => new Promise<void>(() => {});
const resolves = async () => {};
const rejects = async (): Promise<void> => {
  throw new Error('boom');
};

/** Clicks the Run-now icon on mount so the row is caught mid-flight for the story. */
function Triggered({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[title="Run now"]')?.click();
  }, []);
  return <div ref={ref}>{children}</div>;
}

export const AutomationRowIdle: Story = () => (
  <div className="p-6 max-w-3xl border border-border rounded-lg overflow-hidden bg-surface-panel">
    <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={resolves} />
  </div>
);

AutomationRowIdle.storyName = 'Active (row offers Disable)';

const disabledAutomation: AutomationDto = { ...automation, status: 'disabled' };

export const AutomationRowDisabled: Story = () => (
  <div className="p-6 max-w-3xl border border-border rounded-lg overflow-hidden bg-surface-panel">
    <AutomationRow
      automation={disabledAutomation}
      onToggle={noop}
      onDelete={noop}
      onRun={resolves}
    />
  </div>
);
AutomationRowDisabled.storyName = 'Disabled (row offers Enable)';

export const AutomationRowRunTriggering: Story = () => (
  <div className="p-6 max-w-3xl border border-border rounded-lg overflow-hidden bg-surface-panel">
    <Triggered>
      <AutomationRow
        automation={automation}
        onToggle={noop}
        onDelete={noop}
        onRun={neverResolves}
      />
    </Triggered>
  </div>
);
AutomationRowRunTriggering.storyName = 'Run triggering (in flight, never resolves)';

export const AutomationRowRunSucceeded: Story = () => (
  <div className="p-6 max-w-3xl border border-border rounded-lg overflow-hidden bg-surface-panel">
    <Triggered>
      <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={resolves} />
    </Triggered>
  </div>
);
AutomationRowRunSucceeded.storyName = 'Run succeeded (triggered confirmation)';

export const AutomationRowRunFailed: Story = () => (
  <div className="p-6 max-w-3xl border border-border rounded-lg overflow-hidden bg-surface-panel">
    <Triggered>
      <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={rejects} />
    </Triggered>
  </div>
);
AutomationRowRunFailed.storyName = 'Run failed (visible without hover, retryable)';
