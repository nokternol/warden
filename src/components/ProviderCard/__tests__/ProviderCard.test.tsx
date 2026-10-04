import type { ProviderSummary } from '@app/hooks/useProviderSettings';
import type { ProviderTypeDescriptor } from '@contract/providers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProviderCard from '../index';

const mockProvider: ProviderSummary = {
  id: 1,
  type: 'RADARR',
  name: 'Radarr Main',
  url: 'http://localhost:7878/api/v3',
  apiKey: '***',
  settings: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const radarrType: ProviderTypeDescriptor = {
  type: 'RADARR',
  label: 'Radarr',
  apiPath: '/api/v3',
  filterData: ['Films', 'Profiles'],
};

describe('ProviderCard', () => {
  it("shows its type's served label and the filter data the type provides", () => {
    render(
      <ProviderCard
        provider={mockProvider}
        typeDescriptor={radarrType}
        tasks={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText('Radarr')).toBeInTheDocument();
    expect(screen.queryByText('Filter: Films · Profiles')).toBeInTheDocument();
  });

  it('renders the provider name', () => {
    render(
      <ProviderCard provider={mockProvider} tasks={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('Radarr Main')).toBeInTheDocument();
  });

  it('is collapsed by default (no connection details visible)', () => {
    render(
      <ProviderCard provider={mockProvider} tasks={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByText('API key configured')).not.toBeInTheDocument();
  });

  it('expands to show connection details when header is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ProviderCard provider={mockProvider} tasks={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    expect(screen.getByText('API key configured')).toBeInTheDocument();
  });

  it('reflects the server enabled flag per task — disabled by default', async () => {
    const user = userEvent.setup();
    render(
      <ProviderCard
        provider={mockProvider}
        tasks={[
          { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
          {
            id: 'deleteMovieWithFiles',
            label: 'Delete movie + files',
            destructive: true,
            enabled: false,
          },
        ]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));

    // Enabled task offers "Disable"; disabled task offers "Enable".
    expect(screen.getByRole('switch', { name: /disable "unmonitor movie"/i })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: /enable "delete movie \+ files"/i })
    ).not.toBeChecked();
  });

  it('persists an enablement change via onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue({});
    render(
      <ProviderCard
        provider={mockProvider}
        tasks={[
          { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: false },
        ]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('switch', { name: /enable "unmonitor movie"/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ enabledTasks: ['unmonitorMovie'] }),
      })
    );
  });

  it('rolls back and surfaces an error when persisting a toggle fails', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('network'));
    render(
      <ProviderCard
        provider={mockProvider}
        tasks={[
          { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: false },
        ]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('switch', { name: /enable "unmonitor movie"/i }));

    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /enable "unmonitor movie"/i })).not.toBeChecked();
  });

  it('renders no Available tasks section for a provider with no tasks', async () => {
    const user = userEvent.setup();
    render(
      <ProviderCard provider={mockProvider} tasks={[]} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    expect(screen.queryByText('Available tasks')).not.toBeInTheDocument();
  });

  it('marks a destructive task with a warning', async () => {
    const user = userEvent.setup();
    render(
      <ProviderCard
        provider={mockProvider}
        tasks={[
          {
            id: 'deleteMovieWithFiles',
            label: 'Delete movie + files',
            destructive: true,
            enabled: false,
          },
        ]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    expect(screen.getByLabelText('Destructive action')).toBeInTheDocument();
  });

  it('edits the host without the served API path and saves it with the path re-appended', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ProviderCard
        provider={{ ...mockProvider, url: 'http://localhost:7878/api/v4' }}
        typeDescriptor={{ ...radarrType, apiPath: '/api/v4' }}
        tasks={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    const host = screen.getByLabelText(/host url/i) as HTMLInputElement;
    expect(host.value).toBe('http://localhost:7878');

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:7878/api/v4' })
    );
  });
});
