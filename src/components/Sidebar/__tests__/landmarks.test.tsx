import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Sidebar from '../index';

const items = [
  { id: 'media', label: 'Media', icon: null, href: '/media', active: true },
  { id: 'runs', label: 'Runs', icon: null, href: '/runs', active: false },
];
const bottomItems = [{ id: 'system', label: 'System', icon: null, href: '/system', active: false }];

describe('Sidebar landmarks', () => {
  it('marks the current page', () => {
    render(<Sidebar items={items} bottomItems={bottomItems} />);
    expect(screen.getByRole('link', { name: 'Media' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Runs' })).not.toHaveAttribute('aria-current');
  });

  it('labels each navigation', () => {
    render(<Sidebar items={items} bottomItems={bottomItems} />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Configuration' })).toBeInTheDocument();
  });
});
