import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import type { Story } from '@ladle/react';
import RunRow from './index';

const succeeded: AutomationRunDto = {
  id: 1,
  automationId: 1,
  automationName: 'Nightly Cleanup',
  ranAt: '2026-06-04T02:00:00.000Z',
  status: 'success',
  itemCount: 5,
  error: null,
  createdAt: '2026-06-04T02:00:00.000Z',
};

const failed: AutomationRunDto = {
  ...succeeded,
  id: 2,
  ranAt: '2026-06-03T02:00:00.000Z',
  status: 'error',
  itemCount: 0,
  error: 'Connection refused',
};

function RunsTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-4xl">
      <table className="w-full border border-border rounded-lg bg-surface-panel">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const WithTargetedItems: Story = () => (
  <RunsTable>
    <RunRow run={succeeded} />
  </RunsTable>
);
WithTargetedItems.storyName = 'Run that targeted items (expandable)';

export const WithoutTargetedItems: Story = () => (
  <RunsTable>
    <RunRow run={failed} />
  </RunsTable>
);
WithoutTargetedItems.storyName = 'Run that targeted nothing';
