import type { Story } from '@ladle/react';
import AsyncBoundary, { LoadError, SkeletonRows } from './index';

export const Failed: Story = () => (
  <div className="p-6 max-w-3xl bg-surface-bg">
    <LoadError what="automations" onRetry={() => new Promise((r) => setTimeout(r, 1000))} />
  </div>
);

export const Loading: Story = () => (
  <div className="p-6 max-w-3xl bg-surface-bg">
    <SkeletonRows />
  </div>
);

export const StaleDataAfterFailedRefresh: Story = () => (
  <div className="p-6 max-w-3xl bg-surface-bg space-y-3">
    <AsyncBoundary
      data={['Nightly cleanup']}
      error={new Error('offline')}
      onRetry={() => {}}
      what="automations"
      isEmpty={(list) => list.length === 0}
      empty={null}
    >
      {(list) => <p className="text-sm text-text-primary">{list[0]}</p>}
    </AsyncBoundary>
  </div>
);
