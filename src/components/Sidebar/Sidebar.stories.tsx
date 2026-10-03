import type { SidebarItem } from '@app/types/navigation';
import type { Story } from '@ladle/react';
import Sidebar from './index';

// Demo icons
const DashboardIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const AutomationIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
    />
  </svg>
);

const FolderIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const RunsIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

const SystemIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
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
  { id: 'calendar', label: 'Calendar', icon: <CalendarIcon />, href: '/calendar' },
  { id: 'runs', label: 'Runs', icon: <RunsIcon />, href: '/runs' },
];

const bottomItems: SidebarItem[] = [
  { id: 'settings', label: 'Settings', icon: <SettingsIcon />, href: '/settings' },
  { id: 'system', label: 'System', icon: <SystemIcon />, href: '/system', badge: 1 },
];

export const Basic: Story = () => (
  <div className="bg-surface-bg h-screen">
    <div className="h-full w-64">
      <Sidebar items={sampleItems} />
    </div>
  </div>
);

export const WithBottomItems: Story = () => (
  <div className="bg-surface-bg h-screen">
    <div className="h-full w-64">
      <Sidebar items={sampleItems} bottomItems={bottomItems} />
    </div>
  </div>
);

export const WithLogo: Story = () => (
  <div className="bg-surface-bg h-screen">
    <div className="h-full w-64">
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
    </div>
  </div>
);

export const WithBadges: Story = () => (
  <div className="bg-surface-bg h-screen">
    <div className="h-full w-64">
      <Sidebar
        items={[
          { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, href: '/dashboard' },
          {
            id: 'automations',
            label: 'Automations',
            icon: <AutomationIcon />,
            href: '/automations',
            badge: 12,
          },
          {
            id: 'queries',
            label: 'Queries',
            icon: <FolderIcon />,
            href: '/queries',
            badge: '99+',
          },
          {
            id: 'calendar',
            label: 'Calendar',
            icon: <CalendarIcon />,
            href: '/calendar',
            badge: 3,
          },
        ]}
        logo={<div className="text-lg font-bold text-text-primary">Badge Example</div>}
      />
    </div>
  </div>
);

export const DifferentActiveStates: Story = () => (
  <div className="bg-surface-bg h-screen flex gap-4 p-4">
    <div className="h-full w-64">
      <Sidebar
        items={sampleItems.map((item, i) => ({ ...item, active: i === 0 }))}
        logo={<div className="text-text-primary font-bold">Dashboard Active</div>}
      />
    </div>
    <div className="h-full w-64">
      <Sidebar
        items={sampleItems.map((item, i) => ({ ...item, active: i === 1 }))}
        logo={<div className="text-text-primary font-bold">Automations Active</div>}
      />
    </div>
  </div>
);
