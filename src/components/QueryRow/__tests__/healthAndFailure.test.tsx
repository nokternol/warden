import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import type { ReadinessFinding } from '@contract/readiness';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QueryRow from '../index';

const query: MediaQueryRecord = {
  id: 1,
  name: 'Stale',
  contentType: 'movie',
  filters: [],
  health: { findings: [], queryList: 'clear' },
  createdAt: '2024-01-01T00:00:00Z',
};

const finding = (kind: ReadinessFinding['kind'], message: string): ReadinessFinding => ({
  id: `${kind}:${message}`,
  kind,
  providerIds: [],
  message,
  clears: '',
});

describe('QueryRow', () => {
  it("marks a query broken and states its findings' messages", () => {
    const broken: MediaQueryRecord = {
      ...query,
      health: {
        ...query.health,
        findings: [
          finding(
            'no-provider',
            'Watched filter needs a Tautulli, Plex or Jellyfin provider, and none is active'
          ),
        ],
        queryList: 'broken',
      },
    };
    render(<QueryRow query={broken} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Watched filter needs a Tautulli, Plex or Jellyfin provider, and none is active/
      )
    ).toBeInTheDocument();
  });

  it('asks to check data, saying what clears it, when every finding can be signed off', () => {
    const suspect: MediaQueryRecord = {
      ...query,
      health: {
        ...query.health,
        findings: [
          {
            ...finding(
              'no-data',
              'Seerr request status filter has no data: no movie holds a value for it'
            ),
            clears:
              'An automation relying on this filter needs it signed off on the Automations page.',
          },
        ],
        queryList: 'checkData',
      },
    };
    render(<QueryRow query={suspect} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Check data')).toBeInTheDocument();
    expect(screen.getByText(/needs it signed off on the Automations page/)).toBeInTheDocument();
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
