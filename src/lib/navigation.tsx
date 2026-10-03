import type { SidebarItem } from '@app/types/navigation';
import {
  Clapperboard,
  History,
  LayoutDashboard,
  Monitor,
  Search,
  Settings,
  Zap,
} from 'lucide-react';

export const NAV_ITEMS: Omit<SidebarItem, 'active'>[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} strokeWidth={1.75} />,
    href: '/dashboard',
  },
  {
    id: 'media',
    label: 'Media',
    icon: <Clapperboard size={20} strokeWidth={1.75} />,
    href: '/media',
  },
  {
    id: 'search',
    label: 'Search',
    icon: <Search size={20} strokeWidth={1.75} />,
    href: '/search',
  },
  {
    id: 'automations',
    label: 'Automations',
    icon: <Zap size={20} strokeWidth={1.75} />,
    href: '/automations',
  },
  {
    id: 'runs',
    label: 'Runs',
    icon: <History size={20} strokeWidth={1.75} />,
    href: '/runs',
  },
];

export const BOTTOM_NAV_ITEMS: Omit<SidebarItem, 'active'>[] = [
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings size={20} strokeWidth={1.75} />,
    href: '/settings',
  },
  {
    id: 'system',
    label: 'System',
    icon: <Monitor size={20} strokeWidth={1.75} />,
    href: '/system',
  },
];

export function resolveNavItems(pathname: string): {
  items: SidebarItem[];
  bottomItems: SidebarItem[];
} {
  const activate = (item: Omit<SidebarItem, 'active'>): SidebarItem => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  });

  return {
    items: NAV_ITEMS.map(activate),
    bottomItems: BOTTOM_NAV_ITEMS.map(activate),
  };
}
