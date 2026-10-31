import type { AutomationDto } from '@app/hooks/useAutomations';
import { contract } from '@contract/index';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RunsPage from '../index.page';

const router = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn(async () => true),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/runs', asPath: '/runs', ...router }),
}));

const automation = (id: number, name: string): AutomationDto => ({
  id,
  name,
  kind: 'user',
  query: null,
  queries: [],
  provider: null,
  taskId: 't',
  schedule: '0 2 * * *',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

const page = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <RunsPage />
    </SWRConfig>
  );

describe('Runs by automation', () => {
  beforeEach(() => {
    router.query = {};
    router.replace.mockClear();
    server.use(
      mockProcedure(contract.automations.list, () => [
        automation(3, 'Nightly'),
        automation(4, 'Weekly'),
      ])
    );
  });

  it('a deep link shows only that automation', async () => {
    router.query = { automationId: '3' };
    let asked: string | null = null;
    server.use(
      mockProcedure(contract.automations.runs, ({ request }) => {
        asked = new URL(request.url).searchParams.get('automationId');
        return { data: [], total: 0 };
      })
    );
    page();
    await waitFor(() => expect(asked).toBe('3'));
    await waitFor(() => expect(screen.getByLabelText('Automation')).toHaveValue('3'));
  });

  it('choosing an automation updates the URL', async () => {
    const user = userEvent.setup();
    page();
    await screen.findByRole('option', { name: 'Weekly' });
    await user.selectOptions(screen.getByLabelText('Automation'), '4');
    expect(router.replace).toHaveBeenCalledWith(
      { pathname: '/runs', query: { automationId: '4' } },
      undefined,
      { shallow: true }
    );
  });

  it('the header and statuses read consistently', async () => {
    page();
    expect(await screen.findByRole('columnheader', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ran at' })).toBeInTheDocument();
    expect((await screen.findAllByText('Succeeded')).length).toBeGreaterThan(0);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
