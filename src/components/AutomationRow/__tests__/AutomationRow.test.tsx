import StatusDot from '@app/components/StatusDot';
import type { AutomationDto } from '@app/hooks/useAutomations';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AutomationRow from '../index';

const mockAutomation: AutomationDto = {
  id: 1,
  name: 'Archive old movies',
  kind: 'user',
  query: {
    id: 1,
    name: 'Stale Movies',
    contentType: 'movie',
  },
  queries: [{ queryId: 1, role: 'include', sortOrder: 0 }],
  provider: { id: 1, name: 'Radarr', type: 'RADARR' },
  taskId: 'deleteMovieWithFiles',
  schedule: '0 2 * * *',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('AutomationRow', () => {
  it('renders the automation name', () => {
    render(<AutomationRow automation={mockAutomation} onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Archive old movies')).toBeInTheDocument();
  });

  it('offers Disable on an active automation and calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<AutomationRow automation={mockAutomation} onToggle={onToggle} onDelete={vi.fn()} />);
    await user.click(screen.getByTitle('Disable'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle('Enable')).not.toBeInTheDocument();
  });

  it('offers Enable on a disabled automation and calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const disabled: AutomationDto = { ...mockAutomation, status: 'disabled' };
    render(<AutomationRow automation={disabled} onToggle={onToggle} onDelete={vi.fn()} />);
    await user.click(screen.getByTitle('Enable'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle('Disable')).not.toBeInTheDocument();
  });

  it('shows no Play, Pause or Resume control in either state', () => {
    for (const status of ['active', 'disabled'] as const) {
      const { unmount } = render(
        <AutomationRow
          automation={{ ...mockAutomation, status }}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      for (const title of ['Play', 'Pause', 'Resume']) {
        expect(screen.queryByTitle(title)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it('calls onRun when the run-now button is clicked', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <AutomationRow
        automation={mockAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRun={onRun}
      />
    );
    await user.click(screen.getByTitle('Run now'));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows a triggered confirmation after a successful run', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(
      <AutomationRow
        automation={mockAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRun={onRun}
      />
    );
    await user.click(screen.getByTitle('Run now'));
    expect(await screen.findByTitle('Run triggered')).toBeInTheDocument();
  });

  it('shows a failure state when the run rejects, and stays visible without hover', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <AutomationRow
        automation={mockAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRun={onRun}
      />
    );
    await user.click(screen.getByTitle('Run now'));
    const failButton = await screen.findByTitle('Run failed — click to retry');
    expect(failButton.parentElement?.className).not.toMatch(/opacity-0/);
  });

  it('shows only Run-now for a system automation — no schedule toggle, no delete', () => {
    const systemAutomation: AutomationDto = { ...mockAutomation, kind: 'system' };
    render(
      <AutomationRow
        automation={systemAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onRun={vi.fn()}
      />
    );
    expect(screen.getByTitle('Run now')).toBeInTheDocument();
    expect(screen.queryByTitle('Disable')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete automation')).not.toBeInTheDocument();
  });

  it('requires confirmation before calling onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<AutomationRow automation={mockAutomation} onToggle={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByTitle('Delete automation'));
    // Confirmation shown — click confirm
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
