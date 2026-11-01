import RowTable from '@app/components/RowTable';
import type { AutomationDto } from '@app/hooks/useAutomations';
import type { Story } from '@ladle/react';
import { useEffect } from 'react';
import AutomationRow, { AUTOMATION_COLUMNS } from './index';

const automation: AutomationDto = {
  id: 1,
  name: 'Archive old movies',
  kind: 'user',
  query: { id: 1, name: 'Stale Movies', contentType: 'movie' },
  queries: [{ queryId: 1, role: 'include', sortOrder: 0 }],
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
  useEffect(() => {
    document.querySelector<HTMLButtonElement>('[title="Run now"]')?.click();
  }, []);
  return <>{children}</>;
}

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 max-w-4xl">
    <div className="border border-border rounded-lg overflow-hidden bg-surface-panel">
      <RowTable label="Automations" columns={AUTOMATION_COLUMNS}>
        {children}
      </RowTable>
    </div>
  </div>
);

export const AutomationRowIdle: Story = () => (
  <Frame>
    <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={resolves} />
  </Frame>
);

AutomationRowIdle.storyName = 'Active (row offers Disable)';

const disabledAutomation: AutomationDto = { ...automation, status: 'disabled' };

export const AutomationRowDisabled: Story = () => (
  <Frame>
    <AutomationRow
      automation={disabledAutomation}
      onToggle={noop}
      onDelete={noop}
      onRun={resolves}
    />
  </Frame>
);
AutomationRowDisabled.storyName = 'Disabled (row offers Enable)';

export const AutomationRowRunTriggering: Story = () => (
  <Frame>
    <Triggered>
      <AutomationRow
        automation={automation}
        onToggle={noop}
        onDelete={noop}
        onRun={neverResolves}
      />
    </Triggered>
  </Frame>
);
AutomationRowRunTriggering.storyName = 'Run triggering (in flight, never resolves)';

export const AutomationRowRunSucceeded: Story = () => (
  <Frame>
    <Triggered>
      <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={resolves} />
    </Triggered>
  </Frame>
);
AutomationRowRunSucceeded.storyName = 'Run succeeded (triggered confirmation)';

export const AutomationRowRunFailed: Story = () => (
  <Frame>
    <Triggered>
      <AutomationRow automation={automation} onToggle={noop} onDelete={noop} onRun={rejects} />
    </Triggered>
  </Frame>
);
AutomationRowRunFailed.storyName = 'Run failed (visible without hover, retryable)';

export const AutomationRowLastRunFailed: Story = () => (
  <Frame>
    <AutomationRow
      automation={{
        ...automation,
        lastRun: {
          at: '2024-01-01T00:00:00Z',
          status: 'error',
          itemCount: 0,
          error: 'Radarr answered 503 while unmonitoring items',
        },
      }}
      onToggle={noop}
      onDelete={noop}
      onRun={resolves}
    />
  </Frame>
);
AutomationRowLastRunFailed.storyName = 'Last run failed (states the reason)';
