import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TopBar from '../index';

describe('TopBar', () => {
  it('renders title when provided', () => {
    render(<TopBar title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('does not render title when not provided', () => {
    const { container } = render(<TopBar />);
    const title = container.querySelector('h1');
    expect(title).not.toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(<TopBar title="Test" actions={<button type="button">Action Button</button>} />);
    expect(screen.getByText('Action Button')).toBeInTheDocument();
  });

  it('renders breadcrumbs when provided', () => {
    render(
      <TopBar
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Automations', href: '/automations' },
          { label: 'Details' },
        ]}
      />
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Automations')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders breadcrumb links correctly', () => {
    render(<TopBar breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Automations' }]} />);
    const homeLink = screen.getByText('Home');
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');

    const automationsText = screen.getByText('Automations');
    expect(automationsText.tagName).toBe('SPAN');
  });

  it('renders breadcrumb separators', () => {
    const { container } = render(
      <TopBar breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Automations' }]} />
    );
    const separator = container.querySelector('nav span');
    expect(separator?.textContent).toContain('/');
  });

  it('does not render breadcrumbs when not provided', () => {
    const { container } = render(<TopBar title="Test" />);
    const nav = container.querySelector('nav');
    expect(nav).not.toBeInTheDocument();
  });

  it('applies sticky positioning when sticky prop is true', () => {
    const { container } = render(<TopBar title="Test" sticky={true} />);
    const topBar = container.firstChild as HTMLElement;
    expect(topBar.className).toMatch(/isSticky/);
  });

  it('does not apply sticky positioning by default', () => {
    const { container } = render(<TopBar />);
    const topBar = container.firstChild as HTMLElement;
    expect(topBar).not.toHaveClass('sticky');
  });

  it('accepts custom className', () => {
    const { container } = render(<TopBar className="custom-class" />);
    const topBar = container.firstChild as HTMLElement;
    expect(topBar).toHaveClass('custom-class');
  });

  it('passes through HTML attributes', () => {
    const { container } = render(<TopBar data-testid="custom-topbar" />);
    expect(container.querySelector('[data-testid="custom-topbar"]')).toBeInTheDocument();
  });

  it('renders all elements together', () => {
    render(
      <TopBar
        title="Dashboard"
        breadcrumbs={[{ label: 'Home', href: '/' }]}
        actions={<button type="button">Action</button>}
      />
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
