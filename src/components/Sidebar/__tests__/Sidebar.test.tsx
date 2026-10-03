import type { SidebarItem } from '@app/types/navigation';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../index';

const TestIcon = () => <svg data-testid="test-icon" />;

const sampleItems: SidebarItem[] = [
  { id: '1', label: 'Dashboard', icon: <TestIcon />, href: '/dashboard' },
  { id: '2', label: 'Automations', icon: <TestIcon />, href: '/automations' },
];

const bottomItems: SidebarItem[] = [
  { id: '3', label: 'Settings', icon: <TestIcon />, href: '/settings' },
];

describe('Sidebar', () => {
  it('renders navigation items correctly', () => {
    render(<Sidebar items={sampleItems} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Automations')).toBeInTheDocument();
  });

  it('renders bottom items when provided', () => {
    render(<Sidebar items={sampleItems} bottomItems={bottomItems} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render bottom items when not provided', () => {
    render(<Sidebar items={sampleItems} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders logo when provided', () => {
    render(<Sidebar items={sampleItems} logo={<div>Logo Content</div>} />);
    expect(screen.getByText('Logo Content')).toBeInTheDocument();
  });

  it('renders when collapsed', () => {
    const { container } = render(<Sidebar items={sampleItems} collapsed={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onItemClick when item is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Sidebar items={sampleItems} onItemClick={handleClick} />);

    const dashboardLink = screen.getByText('Dashboard');
    await user.click(dashboardLink);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(sampleItems[0]);
  });

  it('renders badges on items', () => {
    const itemsWithBadge: SidebarItem[] = [
      { id: '1', label: 'Automations', icon: <TestIcon />, href: '/automations', badge: 5 },
    ];
    render(<Sidebar items={itemsWithBadge} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('highlights active item', () => {
    const itemsWithActive: SidebarItem[] = [
      { id: '1', label: 'Dashboard', icon: <TestIcon />, href: '/dashboard', active: true },
      { id: '2', label: 'Automations', icon: <TestIcon />, href: '/automations' },
    ];
    render(<Sidebar items={itemsWithActive} />);

    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink?.className).toMatch(/itemActive/);
  });

  it('renders correct href for items', () => {
    render(<Sidebar items={sampleItems} />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('accepts custom className', () => {
    const { container } = render(<Sidebar items={sampleItems} className="custom-class" />);
    const sidebar = container.firstChild as HTMLElement;
    expect(sidebar).toHaveClass('custom-class');
  });

  it('passes through HTML attributes', () => {
    const { container } = render(<Sidebar items={sampleItems} data-testid="custom-sidebar" />);
    expect(container.querySelector('[data-testid="custom-sidebar"]')).toBeInTheDocument();
  });

  it('renders divider between main and bottom items', () => {
    const { container } = render(<Sidebar items={sampleItems} bottomItems={bottomItems} />);
    const divider = container.querySelector('[class*="divider"]');
    expect(divider).toBeInTheDocument();
  });
});
