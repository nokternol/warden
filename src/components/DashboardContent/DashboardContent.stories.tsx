import AppLayout from '@app/components/AppLayout';
import Sidebar from '@app/components/Sidebar';
import TopBar from '@app/components/TopBar';
import type { AutomationDto } from '@app/hooks/useAutomations';

import type { SidebarItem } from '@app/types/navigation';
import type { Story } from '@ladle/react';
import { DashboardContent } from './index';

// ── Shared chrome ──────────────────────────────────────────────────────────────

const navItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: null, href: '/dashboard', active: true },
  { id: 'media', label: 'Media', icon: null, href: '/media' },
  { id: 'automations', label: 'Automations', icon: null, href: '/automations', badge: 1 },
];

const bottomNavItems: SidebarItem[] = [
  { id: 'settings', label: 'Settings', icon: null, href: '/settings' },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      sidebar={
        <Sidebar
          items={navItems}
          bottomItems={bottomNavItems}
          logo={<span className="text-xl font-bold text-text-primary">Warden</span>}
        />
      }
      topBar={
        <TopBar
          title="Dashboard"
          actions={
            <button
              type="button"
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-sm"
            >
              + New automation
            </button>
          }
        />
      }
    >
      {children}
    </AppLayout>
  );
}

// ── Fixture helpers ─────────────────────────────────────────────────────────────

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

function mockAutomation(
  overrides: Partial<AutomationDto> & { id: number; name: string }
): AutomationDto {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    kind: 'user' as const,
    query: { id: 1, name: 'Movies > 2yr, unwatched', contentType: 'movie' as const },
    queries: [{ queryId: 1, role: 'include' as const, sortOrder: 0 }],
    provider: { id: 1, name: 'My Plex', type: 'PLEX' },
    taskId: 'deleteFromLibrary',
    schedule: '0 2 * * 0',
    status: 'active',
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(2),
    ...rest,
  };
}

// ── Fixture data ────────────────────────────────────────────────────────────────

const activeAutomations: AutomationDto[] = [
  mockAutomation({
    id: 1,
    name: 'Archive stale movies',
    query: { id: 1, name: 'Movies > 2yr, unwatched', contentType: 'movie' as const },
    taskId: 'deleteFromLibrary',
    lastRun: { at: hoursAgo(2), itemCount: 12, status: 'success' },
    nextRun: hoursFromNow(120),
  }),
  mockAutomation({
    id: 2,
    name: 'Refresh missing metadata',
    query: { id: 2, name: 'All movies, rating absent', contentType: 'movie' as const },
    taskId: 'refreshMetadata',
    lastRun: { at: hoursAgo(22), itemCount: 847, status: 'success' },
    nextRun: hoursFromNow(2),
  }),
  mockAutomation({
    id: 3,
    name: 'Tag recent additions',
    query: { id: 3, name: 'Added in last 30 days', contentType: 'movie' as const },
    taskId: 'addTag',
    provider: { id: 2, name: 'My Radarr', type: 'RADARR' },
    lastRun: { at: hoursAgo(14), itemCount: 3, status: 'success' },
    nextRun: hoursFromNow(10),
  }),
];

const disabledAutomation = mockAutomation({
  id: 5,
  name: 'Notify on 4K availability',
  status: 'disabled',
  lastRun: { at: hoursAgo(336), itemCount: 6, status: 'success' },
});

const neverRunAutomation = mockAutomation({
  id: 6,
  name: 'Clean watched shorts',
  nextRun: hoursFromNow(288),
});

// ── Stories ────────────────────────────────────────────────────────────────────

/** Default state: mix of active and disabled automations. */
export const Default: Story = () => (
  <Shell>
    <DashboardContent automations={[...activeAutomations.slice(0, 2), disabledAutomation]} />
  </Shell>
);

/** All automations healthy, no errors. */
export const AllActive: Story = () => (
  <Shell>
    <DashboardContent automations={activeAutomations} />
  </Shell>
);

/** Automation that has never been run. */
export const WithNeverRun: Story = () => (
  <Shell>
    <DashboardContent automations={[activeAutomations[0], neverRunAutomation]} />
  </Shell>
);

/** Empty state: no automations configured yet. */
export const Empty: Story = () => (
  <Shell>
    <DashboardContent automations={[]} />
  </Shell>
);
