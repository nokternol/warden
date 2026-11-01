import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { contract } from '@contract/index';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import QueryRow from '../index';

const mockQuery: MediaQueryRecord = {
  id: 1,
  name: 'Stale Movies',
  contentType: 'movie',
  filters: [{ ruleKey: 'year', value: { max: 2020 } }],
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
    const load = screen.getByRole('button', { name: /load/i });
    await waitFor(() => expect(load).toBeEnabled());
    await user.click(load);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('will not open in Media when a filter would be lost, and says why', async () => {
    const query = { ...mockQuery, filters: [{ ruleKey: 'noLongerOffered', value: 'x' }] };
    render(<QueryRow query={query} onLoad={vi.fn()} onDelete={vi.fn()} />);
    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load/i })).toBeDisabled();
  });

  it('says so when filter names fail to load', async () => {
    server.use(mockProcedureFailure(contract.media.tags, 500));
    render(
      <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0 }}>
        <QueryRow query={mockQuery} onLoad={vi.fn()} onDelete={vi.fn()} />
      </SWRConfig>
    );
    expect(await screen.findByText(/couldn.t load filter names/i)).toBeInTheDocument();
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
