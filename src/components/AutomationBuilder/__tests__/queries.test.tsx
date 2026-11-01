import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { contract } from '@contract/index';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure, mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { delay } from 'msw';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationBuilder from '../index';

const query = (id: number, name: string): MediaQueryRecord => ({
  id,
  name,
  contentType: 'movie',
  filters: [],
  health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
  createdAt: '2024-01-01T00:00:00Z',
});
const QUERIES = [query(1, 'Old Movies'), query(2, 'Watchlist')];

const PROVIDER = {
  id: 1,
  type: 'RADARR' as const,
  name: 'Radarr Main',
  url: 'http://r/api/v3',
  apiKey: '***' as const,
  settings: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};
const DELETE = { id: 'del', label: 'Delete movie', destructive: true, enabled: true };
const UNMONITOR = { id: 'un', label: 'Unmonitor movie', destructive: false, enabled: true };

function renderBuilder(props: Partial<React.ComponentProps<typeof AutomationBuilder>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0, dedupingInterval: 0 }}>
      <AutomationBuilder
        queries={QUERIES}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
        {...props}
      />
    </SWRConfig>
  );
}

beforeEach(() => {
  server.use(
    mockProcedure(contract.providers.list, () => [PROVIDER]),
    mockProcedure(contract.providers.tasks, () => [
      { providerId: 1, type: 'RADARR', tasks: [UNMONITOR, DELETE] },
    ]),
    mockProcedure(contract.mediaQueries.preview, () => ({ count: 5 }) as never),
    mockProcedure(contract.automations.preview, () => ({ count: 3, contentType: 'movie' as const }))
  );
});

async function pickTask(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole('radio', { name: new RegExp(label) }));
}

describe('choosing queries', () => {
  it('opens with the first query chosen in a labelled select', () => {
    renderBuilder();
    expect(screen.getByRole('combobox', { name: 'Query 1' })).toHaveValue('1');
    expect(screen.getByRole('option', { name: 'Old Movies' })).toBeInTheDocument();
  });

  it('adds the first unused query, never a blank row', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Add query' }));
    expect(screen.getByRole('combobox', { name: 'Query 2' })).toHaveValue('2');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('saves every chosen query, with its role, once there are two', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderBuilder({ onSubmit });

    await user.type(screen.getByLabelText('Name'), 'Clean');
    await user.click(screen.getByRole('button', { name: 'Add query' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role of query 2' }), 'exclude');
    await pickTask(user, 'Unmonitor movie');
    await user.click(screen.getByRole('button', { name: 'Create automation' }));

    expect(onSubmit.mock.calls[0][0].queries).toEqual([
      { queryId: 1, role: 'include', sortOrder: 0 },
      { queryId: 2, role: 'exclude', sortOrder: 1 },
    ]);
  });

  it('stops offering Add query once every query is chosen', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Add query' }));
    expect(screen.getByRole('button', { name: 'Add query' })).toBeDisabled();
  });
});

describe('the schedule', () => {
  it('groups its presets and reports which is pressed', () => {
    renderBuilder();
    expect(screen.getByRole('group', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daily 2am' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Weekly' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('labels the custom cron input', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByLabelText('Cron expression')).toBeInTheDocument();
  });

  it('has one Cancel', () => {
    renderBuilder();
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('explains Destructive and Exclude', async () => {
    renderBuilder();
    expect(await screen.findByText(/destructive tasks delete or change/i)).toBeInTheDocument();
    expect(screen.getByText(/exclude removes/i)).toBeInTheDocument();
  });
});

describe('the blast radius', () => {
  const confirmBox = () => screen.getByRole('checkbox');

  it('keeps the confirmation disabled until the count has arrived', async () => {
    server.use(
      mockProcedure(contract.automations.preview, async () => {
        await delay('infinite');
        return { count: 3, contentType: 'movie' as const };
      })
    );
    const user = userEvent.setup();
    renderBuilder();
    await pickTask(user, 'Delete movie');
    expect(await screen.findByText(/counting affected items/i)).toBeInTheDocument();
    expect(confirmBox()).toBeDisabled();
  });

  it('asks for a query when none is chosen, instead of counting', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await pickTask(user, 'Delete movie');
    await user.click(screen.getByRole('button', { name: /remove query 1/i }));
    expect(screen.getByText(/choose a query to see how many/i)).toBeInTheDocument();
    expect(screen.queryByText(/counting/i)).not.toBeInTheDocument();
    expect(confirmBox()).toBeDisabled();
  });

  it('blocks on a failed count and offers a retry', async () => {
    server.use(mockProcedureFailure(contract.automations.preview, 500));
    const user = userEvent.setup();
    renderBuilder();
    await pickTask(user, 'Delete movie');
    expect(await screen.findByText(/couldn.t count the affected items/i)).toBeInTheDocument();
    expect(confirmBox()).toBeDisabled();

    server.use(
      mockProcedure(contract.automations.preview, () => ({
        count: 3,
        contentType: 'movie' as const,
      }))
    );
    await user.click(screen.getByRole('button', { name: 'Retry count' }));
    await waitFor(() => expect(confirmBox()).toBeEnabled());
    expect(screen.getByText(/will affect 3 movies/)).toBeInTheDocument();
  });
});

describe('a failed create', () => {
  it('shows an alert and keeps what was entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Name already taken'));
    renderBuilder({ onSubmit });
    await user.type(screen.getByLabelText('Name'), 'Clean');
    await pickTask(user, 'Unmonitor movie');
    await user.click(screen.getByRole('button', { name: 'Create automation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Name already taken');
    expect(screen.getByLabelText('Name')).toHaveValue('Clean');
  });
});
