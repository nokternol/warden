import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatCard from '../index';

const TestIcon = () => <svg data-testid="test-icon" />;

describe('StatCard', () => {
  it('renders value and label correctly', () => {
    render(<StatCard value={142} label="Active automations" />);
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('Active automations')).toBeInTheDocument();
  });

  it('renders string value correctly', () => {
    render(<StatCard value="Running" label="System Status" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<StatCard value={100} label="Test" icon={<TestIcon />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon when not provided', () => {
    const { queryByTestId } = render(<StatCard value={100} label="Test" />);
    expect(queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<StatCard value={100} label="Test" subtitle="Last updated 5 mins ago" />);
    expect(screen.getByText('Last updated 5 mins ago')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    const { container } = render(<StatCard value={100} label="Test" />);
    const subtitle = container.querySelector('[class*="subtitle_"]');
    expect(subtitle).not.toBeInTheDocument();
  });

  it('renders upward trend correctly', () => {
    render(<StatCard value={100} label="Test" trend={{ value: 12, direction: 'up' }} />);
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('renders downward trend correctly', () => {
    render(<StatCard value={100} label="Test" trend={{ value: 8, direction: 'down' }} />);
    expect(screen.getByText('↓')).toBeInTheDocument();
    expect(screen.getByText('8%')).toBeInTheDocument();
  });

  it('applies correct color for upward trend', () => {
    render(
      <StatCard
        value={100}
        label="Test"
        trend={{ value: 12, direction: 'up' }}
        data-testid="stat-card"
      />
    );
    expect(screen.getByText('↑').parentElement!.className).toMatch(/trendUp/);
  });

  it('applies correct color for downward trend', () => {
    render(
      <StatCard
        value={100}
        label="Test"
        trend={{ value: 8, direction: 'down' }}
        data-testid="stat-card"
      />
    );
    expect(screen.getByText('↓').parentElement!.className).toMatch(/trendDown/);
  });

  it('does not render trend when not provided', () => {
    const { container } = render(<StatCard value={100} label="Test" />);
    // There shouldn't be any trend icon wrapper
    const trend = container.querySelector('[class*="trendWrapper"]');
    expect(trend).not.toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(<StatCard value={100} label="Test" className="custom-class" />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });

  it('passes through HTML attributes', () => {
    const { container } = render(
      <StatCard value={100} label="Test" data-testid="custom-stat-card" />
    );
    expect(container.querySelector('[data-testid="custom-stat-card"]')).toBeInTheDocument();
  });

  it('renders all elements together', () => {
    render(
      <StatCard
        value={142}
        label="Active automations"
        icon={<TestIcon />}
        trend={{ value: 12, direction: 'up' }}
        subtitle="Last updated"
      />
    );

    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('Active automations')).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('Last updated')).toBeInTheDocument();
  });
});
