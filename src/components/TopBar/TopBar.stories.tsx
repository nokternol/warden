import type { Story } from '@ladle/react';
import TopBar from './index';

const DemoButton = ({ children }: { children: React.ReactNode }) => (
  <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-text-primary rounded-lg transition-colors">
    {children}
  </button>
);

export const BasicTitle: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar title="Dashboard" />
  </div>
);

export const WithActions: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar
      title="Automations"
      actions={
        <>
          <DemoButton>New automation</DemoButton>
          <DemoButton>Refresh</DemoButton>
        </>
      }
    />
  </div>
);

export const WithBreadcrumbs: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar
      title="Automation Details"
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Automations', href: '/automations' },
        { label: 'Automation #142' },
      ]}
    />
  </div>
);

export const WithEverything: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar
      title="Query Settings"
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Queries', href: '/queries' },
        { label: 'Settings' },
      ]}
      actions={
        <>
          <button className="px-4 py-2 bg-surface-panel border border-border hover:bg-surface-bg text-text-primary rounded-lg transition-colors">
            Cancel
          </button>
          <DemoButton>Save Changes</DemoButton>
        </>
      }
    />
  </div>
);

export const Sticky: Story = () => (
  <div className="bg-surface-bg h-screen overflow-y-auto">
    <TopBar title="Scrollable Page" sticky={true} />
    <div className="p-6 space-y-4">
      {Array.from({ length: 50 }, (_, i) => (
        <div
          key={i}
          className="bg-surface-panel p-4 rounded-lg border border-border border text-text-primary"
        >
          Content block {i + 1}
        </div>
      ))}
    </div>
  </div>
);

export const NoTitle: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar
      actions={
        <>
          <DemoButton>Action 1</DemoButton>
          <DemoButton>Action 2</DemoButton>
        </>
      }
    />
  </div>
);

export const LongBreadcrumbs: Story = () => (
  <div className="bg-surface-bg min-h-screen">
    <TopBar
      title="Deeply Nested Page"
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Queries', href: '/queries' },
        { label: 'My Query', href: '/queries/1' },
        { label: 'Items', href: '/queries/1/items' },
        { label: 'Item Details' },
      ]}
    />
  </div>
);
