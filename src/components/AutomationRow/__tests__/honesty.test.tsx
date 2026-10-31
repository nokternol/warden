import type { AutomationDto } from '@app/hooks/useAutomations';
import { contract } from '@contract/index';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure, mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationRow from '../index';

const automation: AutomationDto = {
  id: 7,
  name: 'Archive old movies',
  kind: 'user',
  query: { id: 1, name: 'Stale Movies', contentType: 'movie' },
  queries: [{ queryId: 1, role: 'include', sortOrder: 0 }],
  provider: { id: 1, name: 'Radarr', type: 'RADARR' },
  taskId: 'deleteMovieWithFiles',
  schedule: '0 2 * * *',
  status: 'active',
  nextRun: new Date(Date.now() + 3_600_000).toISOString(),
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const task = (destructive: boolean) => ({
  id: 'deleteMovieWithFiles',
  label: 'Delete movie + files',
  destructive,
  enabled: true,
});

function renderRow(props: Partial<React.ComponentProps<typeof AutomationRow>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0, dedupingInterval: 0 }}>
      <AutomationRow automation={automation} {...props} />
    </SWRConfig>
  );
}

beforeEach(() => {
  server.use(
    mockProcedure(contract.providers.tasks, () => [
      { providerId: 1, type: 'RADARR', tasks: [task(false)] },
    ]),
    mockProcedure(contract.automations.runs, () => ({ data: [], total: 0 })),
    mockProcedure(contract.automations.preview, () => ({
      count: 214,
      contentType: 'movie' as const,
    }))
  );
});

describe('what a row says', () => {
  it('names the task by its label, not its id', async () => {
    renderRow();
    expect(await screen.findByText('Delete movie + files')).toBeInTheDocument();
    expect(screen.queryByText('deleteMovieWithFiles')).not.toBeInTheDocument();
  });

  it('gives status a text alternative', () => {
    renderRow({ automation: { ...automation, status: 'disabled' } });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it("shows a failed last run with its reason, without hover, and links to that automation's runs", () => {
    renderRow({
      automation: {
        ...automation,
        lastRun: { at: '2026-01-01T00:00:00Z', itemCount: 0, status: 'error', error: 'Timed out' },
      },
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Timed out')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /runs of archive old movies/i })).toHaveAttribute(
      'href',
      '/runs?automationId=7'
    );
  });

  it('represents a latest run skipped as invalid, with its reason', async () => {
    server.use(
      mockProcedure(contract.automations.runs, () => ({
        data: [
          {
            id: 9,
            automationId: 7,
            automationName: 'Archive old movies',
            ranAt: '2026-01-02T00:00:00.000Z',
            status: 'skipped' as const,
            itemCount: null,
            error: 'Radarr is not an active provider',
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        total: 1,
      }))
    );
    renderRow({
      automation: {
        ...automation,
        lastRun: { at: '2026-01-01T00:00:00Z', itemCount: 3, status: 'success' },
      },
    });
    expect(await screen.findByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText('Radarr is not an active provider')).toBeInTheDocument();
  });

  it('names the automation in its action labels', async () => {
    renderRow({ onRun: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() });
    expect(screen.getByRole('button', { name: 'Run Archive old movies now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable Archive old movies' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Archive old movies' })).toBeInTheDocument();
    await screen.findByText('Delete movie + files');
  });
});

describe('Run Now on a destructive task', () => {
  const destructive = () =>
    server.use(
      mockProcedure(contract.providers.tasks, () => [
        { providerId: 1, type: 'RADARR', tasks: [task(true)] },
      ])
    );
  const runButton = async () => {
    const button = screen.getByRole('button', { name: 'Run Archive old movies now' });
    await waitFor(() => expect(button).toBeEnabled());
    return button;
  };

  it('confirms inline, stating the count, before running', async () => {
    destructive();
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderRow({ onRun });
    await screen.findByText('Delete movie + files');
    await user.click(await runButton());

    expect(onRun).not.toHaveBeenCalled();
    expect(await screen.findByText(/will affect 214 movies/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('blocks on a failed count', async () => {
    destructive();
    server.use(mockProcedureFailure(contract.automations.preview, 500));
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderRow({ onRun });
    await screen.findByText('Delete movie + files');
    await user.click(await runButton());

    expect(await screen.findByText(/couldn.t count/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry count' })).toBeInTheDocument();
  });

  it('runs a non-destructive task in one click', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderRow({ onRun });
    await screen.findByText('Delete movie + files');
    await user.click(await runButton());
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});

describe('failed row actions', () => {
  it('a failed delete says so at the row and keeps the confirmation open', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error('Database is locked'));
    renderRow({ onDelete });
    await user.click(screen.getByRole('button', { name: 'Delete Archive old movies' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is locked');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('a failed toggle says so at the row', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn().mockRejectedValue(new Error('Nope'));
    renderRow({ onToggle });
    await user.click(screen.getByRole('button', { name: 'Disable Archive old movies' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });

  it('a failed run says why at the row', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockRejectedValue(new Error('Scheduler offline'));
    renderRow({ onRun });
    await screen.findByText('Delete movie + files');
    await user.click(screen.getByRole('button', { name: 'Run Archive old movies now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scheduler offline');
  });
});
