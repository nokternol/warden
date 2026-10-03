import type { Story } from '@ladle/react';
import EmptyState from './index';

const InboxIcon = () => (
  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

export const Basic: Story = () => (
  <div className="bg-surface-bg p-8">
    <EmptyState title="No items found" />
  </div>
);

export const WithDescription: Story = () => (
  <div className="bg-surface-bg p-8">
    <EmptyState
      title="No items found"
      description="There are no items to display at this time. Try adjusting your filters or creating a new item."
    />
  </div>
);

export const WithIcon: Story = () => (
  <div className="bg-surface-bg p-8">
    <EmptyState
      icon={<InboxIcon />}
      title="Your inbox is empty"
      description="You're all caught up! There are no new notifications or messages."
    />
  </div>
);

export const WithAction: Story = () => (
  <div className="bg-surface-bg p-8">
    <EmptyState
      icon={<FolderIcon />}
      title="No queries yet"
      description="Get started by creating your first query to choose the media an automation acts on."
      action={{
        label: 'New query',
        onClick: () => alert('New query clicked'),
      }}
    />
  </div>
);

export const InCard: Story = () => (
  <div className="bg-surface-bg p-8">
    <div className="bg-surface-panel rounded-lg border border-border border min-h-[400px]">
      <EmptyState
        icon={<InboxIcon />}
        title="No results"
        description="We couldn't find any items matching your search criteria."
        action={{
          label: 'Clear Filters',
          onClick: () => alert('Clear filters clicked'),
        }}
      />
    </div>
  </div>
);

export const MinimalWithAction: Story = () => (
  <div className="bg-surface-bg p-8">
    <EmptyState
      title="No data available"
      action={{
        label: 'Refresh',
        onClick: () => alert('Refresh clicked'),
      }}
    />
  </div>
);
