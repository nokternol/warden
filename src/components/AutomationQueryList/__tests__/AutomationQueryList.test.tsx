import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AutomationQueryList from '../index';

const queries = [
  { id: 1, name: 'Old Movies' },
  { id: 2, name: 'Watchlist' },
];

describe('AutomationQueryList', () => {
  it('renders an "Add query" button when automationQueries is empty', () => {
    render(<AutomationQueryList automationQueries={[]} queries={queries} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add query/i })).toBeInTheDocument();
  });

  it('shows preview count for an included query as "N matched"', async () => {
    const automationQueries = [{ queryId: 1, role: 'include' as const, sortOrder: 0 }];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/42 matched/i)).toBeInTheDocument());
  });

  it('shows preview count for an excluded query as "N excluded"', async () => {
    const automationQueries = [{ queryId: 2, role: 'exclude' as const, sortOrder: 0 }];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/14 excluded/i)).toBeInTheDocument());
  });

  it('shows approximate net count with ~ prefix when both include and exclude automationQueries are present', async () => {
    const automationQueries = [
      { queryId: 1, role: 'include' as const, sortOrder: 0 },
      { queryId: 2, role: 'exclude' as const, sortOrder: 1 },
    ];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    // MSW: id=1 → 42, id=2 → 14; net = 42 - 14 = 28
    await waitFor(() => expect(screen.getByText(/~28 to act on/i)).toBeInTheDocument());
  });

  it('shows an inline error when automationQueries has no include entry with a selected query', () => {
    const automationQueries = [{ queryId: 1, role: 'exclude' as const, sortOrder: 0 }];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/at least one include/i)).toBeInTheDocument();
  });

  it('hides the error when at least one included query with a valid queryId is present', () => {
    const automationQueries = [{ queryId: 1, role: 'include' as const, sortOrder: 0 }];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/at least one include/i)).not.toBeInTheDocument();
  });

  it('shows a complexity nudge when there are 3 or more exclude automationQueries', () => {
    const automationQueries = [
      { queryId: 1, role: 'include' as const, sortOrder: 0 },
      { queryId: 2, role: 'exclude' as const, sortOrder: 1 },
      { queryId: 3, role: 'exclude' as const, sortOrder: 2 },
      { queryId: 4, role: 'exclude' as const, sortOrder: 3 },
    ];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/complex exclusion rules/i)).toBeInTheDocument();
  });

  it('does not show the nudge with fewer than 3 exclude automationQueries', () => {
    const automationQueries = [
      { queryId: 1, role: 'include' as const, sortOrder: 0 },
      { queryId: 2, role: 'exclude' as const, sortOrder: 1 },
      { queryId: 3, role: 'exclude' as const, sortOrder: 2 },
    ];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/complex exclusion rules/i)).not.toBeInTheDocument();
  });

  it('changing role on an automation query calls onChange with the updated role', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const automationQueries = [{ queryId: 1, role: 'include' as const, sortOrder: 0 }];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={onChange}
      />
    );
    await user.selectOptions(screen.getByRole('combobox'), 'exclude');
    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [typeof automationQueries];
    expect(result[0].role).toBe('exclude');
  });

  it('clicking the remove button calls onChange with that query removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const automationQueries = [
      { queryId: 1, role: 'include' as const, sortOrder: 0 },
      { queryId: 2, role: 'exclude' as const, sortOrder: 1 },
    ];
    render(
      <AutomationQueryList
        automationQueries={automationQueries}
        queries={queries}
        onChange={onChange}
      />
    );
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [typeof automationQueries];
    expect(result).toHaveLength(1);
    expect(result[0].queryId).toBe(2);
  });

  it('clicking "Add query" calls onChange with one new include entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AutomationQueryList automationQueries={[]} queries={queries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /add query/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [ReturnType<typeof onChange>];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: 'include', sortOrder: 0 });
  });
});
