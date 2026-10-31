import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EmptyState from '../index';

const TestIcon = () => <svg data-testid="test-icon" />;

describe('EmptyState', () => {
  it('renders title correctly', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No items" description="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No items" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No items" icon={<TestIcon />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon when not provided', () => {
    const { queryByTestId } = render(<EmptyState title="No items" />);
    expect(queryByTestId('test-icon')).not.toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    render(<EmptyState title="No items" action={{ label: 'Create Item', onClick: () => {} }} />);
    expect(screen.getByRole('button', { name: 'Create Item' })).toBeInTheDocument();
  });

  it('calls action onClick when button is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<EmptyState title="No items" action={{ label: 'Create Item', onClick: handleClick }} />);

    const button = screen.getByRole('button', { name: 'Create Item' });
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when not provided', () => {
    const { queryByRole } = render(<EmptyState title="No items" />);
    expect(queryByRole('button')).not.toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(<EmptyState title="No items" className="custom-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('passes through HTML attributes', () => {
    const { container } = render(<EmptyState title="No items" data-testid="custom-empty-state" />);
    expect(container.querySelector('[data-testid="custom-empty-state"]')).toBeInTheDocument();
  });

  it('renders all elements together', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        description="Description text"
        action={{ label: 'Action', onClick: () => {} }}
      />
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Description text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });
});
