import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QueryRow from '../index';

const mockQuery: MediaQueryRecord = {
  id: 1,
  name: 'Stale Movies',
  contentType: 'movie',
  filters: [{ ruleKey: 'yearMax', value: 2020 }],
  health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
  createdAt: '2024-01-15T00:00:00Z',
};

describe('QueryRow', () => {
  it('renders the query name', () => {
    render(<QueryRow query={mockQuery} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Stale Movies')).toBeInTheDocument();
  });

  it('calls onLoad when Load button is clicked', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<QueryRow query={mockQuery} onLoad={onLoad} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /load/i }));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('shows confirm UI before calling onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<QueryRow query={mockQuery} onLoad={vi.fn()} onDelete={onDelete} />);
    // First click shows confirmation
    await user.click(screen.getByRole('button', { name: /delete query/i }));
    // Confirm delete
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
