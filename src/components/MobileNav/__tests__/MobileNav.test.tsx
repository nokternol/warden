import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import AppLayout from '../../AppLayout';

const nav = () => screen.getByRole('navigation', { name: 'Mobile' });

describe('the mobile navigation', () => {
  it('is mounted by AppLayout on every screen', () => {
    render(<AppLayout>content</AppLayout>);
    expect(nav()).toBeInTheDocument();
  });

  it('reaches all five pages and Sign out, and no deferred page', async () => {
    const user = userEvent.setup();
    render(<AppLayout>content</AppLayout>);
    for (const page of ['Media', 'Automations', 'Runs']) {
      expect(within(nav()).getByRole('link', { name: page })).toBeInTheDocument();
    }
    await user.click(within(nav()).getByRole('button', { name: 'More' }));
    expect(within(nav()).getByRole('link', { name: 'Providers' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(within(nav()).getByRole('link', { name: 'System' })).toBeInTheDocument();
    expect(within(nav()).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Search' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });
});
