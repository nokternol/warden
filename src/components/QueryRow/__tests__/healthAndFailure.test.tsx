import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QueryRow from '../index';

const query: MediaQueryRecord = {
  id: 1,
  name: 'Stale',
  contentType: 'movie',
  filters: [],
  health: {
    status: 'degraded',
    providerStatus: [
      { providerType: 'TAUTULLI', required: false, configured: false, affectedFilterKeys: ['w'] },
    ],
    qualificationIssues: [],
  },
  createdAt: '2024-01-01T00:00:00Z',
};

describe('QueryRow', () => {
  it('surfaces health other than healthy, with the reason', () => {
    render(<QueryRow query={query} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText(/TAUTULLI is not configured/i)).toBeInTheDocument();
  });

  it('a failed delete says so and keeps the confirmation', async () => {
    const user = userEvent.setup();
    render(
      <QueryRow
        query={query}
        onLoad={vi.fn()}
        onDelete={vi.fn().mockRejectedValue(new Error('In use by an automation'))}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete query "Stale"' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('In use by an automation');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
