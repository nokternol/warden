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
  it('surfaces health other than healthy, with the reason', async () => {
    render(<QueryRow query={query} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(await screen.findByText('Tautulli is not configured.')).toBeInTheDocument();
  });

  it('names only providers whose filters nothing connected can supply', async () => {
    const mixed: MediaQueryRecord = {
      ...query,
      health: {
        status: 'degraded',
        providerStatus: [
          {
            providerType: 'RADARR',
            required: false,
            configured: true,
            affectedFilterKeys: ['year'],
          },
          {
            providerType: 'SONARR',
            required: false,
            configured: false,
            affectedFilterKeys: ['year'],
          },
          {
            providerType: 'PLEX',
            required: false,
            configured: false,
            affectedFilterKeys: ['watched'],
          },
        ],
        qualificationIssues: [],
      },
    };
    render(<QueryRow query={mixed} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(await screen.findByText('Plex is not configured.')).toBeInTheDocument();
    expect(screen.queryByText(/sonarr/i)).not.toBeInTheDocument();
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
