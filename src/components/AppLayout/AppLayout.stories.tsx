import Card from '@app/components/Card';
import StatCard from '@app/components/StatCard';
import type { SidebarItem } from '@app/types/navigation';
import type { Story } from '@ladle/react';
import Sidebar from '../Sidebar';
import TopBar from '../TopBar';
import WidgetGrid from '../WidgetGrid';
import AppLayout from './index';

// Demo icons
const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const AutomationIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
    />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const sampleItems: SidebarItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    href: '/dashboard',
    active: true,
  },
  {
    id: 'automations',
    label: 'Automations',
    icon: <AutomationIcon />,
    href: '/automations',
    badge: 5,
  },
  { id: 'queries', label: 'Queries', icon: <FolderIcon />, href: '/queries' },
];

const bottomItems: SidebarItem[] = [
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, href: '/settings' },
];

export const BasicWithContent: Story = () => (
  <AppLayout>
    <div className="p-6 text-text-primary">
      <h2 className="text-2xl font-bold mb-4">Main Content</h2>
      <p className="text-text-muted">This is the main content area without sidebar or top bar.</p>
    </div>
  </AppLayout>
);

export const WithSidebar: Story = () => (
  <AppLayout
    sidebar={
      <Sidebar
        items={sampleItems}
        bottomItems={bottomItems}
        logo={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-text-primary font-bold">
              M
            </div>
            <span className="text-xl font-bold text-text-primary">Warden</span>
          </div>
        }
      />
    }
  >
    <div className="p-6 text-text-primary">
      <h2 className="text-2xl font-bold mb-4">Main Content</h2>
      <p className="text-text-muted">This layout includes a sidebar.</p>
    </div>
  </AppLayout>
);

export const WithTopBar: Story = () => (
  <AppLayout
    topBar={
      <TopBar
        title="Dashboard"
        actions={
          <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-text-primary rounded-lg transition-colors">
            New automation
          </button>
        }
      />
    }
  >
    <div className="p-6 text-text-primary">
      <h2 className="text-2xl font-bold mb-4">Main Content</h2>
      <p className="text-text-muted">This layout includes a top bar.</p>
    </div>
  </AppLayout>
);

export const CompleteLayout: Story = () => (
  <AppLayout
    sidebar={
      <Sidebar
        items={sampleItems}
        bottomItems={bottomItems}
        logo={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-text-primary font-bold">
              M
            </div>
            <span className="text-xl font-bold text-text-primary">Warden</span>
          </div>
        }
      />
    }
    topBar={
      <TopBar
        title="Dashboard"
        actions={
          <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-text-primary rounded-lg transition-colors">
            New automation
          </button>
        }
      />
    }
  >
    <div className="p-6">
      <WidgetGrid columns={4}>
        <StatCard
          value={142}
          label="Active automations"
          icon={<AutomationIcon />}
          trend={{ value: 12, direction: 'up' }}
        />
        <StatCard value={28} label="Queries" icon={<FolderIcon />} />
        <StatCard value="Running" label="System Status" />
        <StatCard value={5} label="Recent runs" trend={{ value: 8, direction: 'down' }} />

        <div className="col-span-1 md:col-span-2 lg:col-span-4">
          <Card variant="outlined" padding="none">
            <Card.Header>
              <h3 className="text-text-primary font-semibold">Recent runs</h3>
            </Card.Header>
            <Card.Content divided>
              <div className="text-text-muted">Automation list content would go here...</div>
            </Card.Content>
          </Card>
        </div>
      </WidgetGrid>
    </div>
  </AppLayout>
);

export const ScrollableContent: Story = () => (
  <AppLayout
    sidebar={
      <Sidebar
        items={sampleItems}
        logo={<div className="text-xl font-bold text-text-primary">Warden</div>}
      />
    }
    topBar={<TopBar title="Scrollable Page" sticky={true} />}
  >
    <div className="p-6 space-y-4">
      {Array.from({ length: 30 }, (_, i) => (
        <Card key={i} variant="outlined">
          <p className="text-text-primary">Content block {i + 1}</p>
          <p className="text-text-muted text-sm">
            This demonstrates scrollable content with a sticky top bar.
          </p>
        </Card>
      ))}
    </div>
  </AppLayout>
);
