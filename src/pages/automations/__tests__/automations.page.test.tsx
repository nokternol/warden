import { contract } from '@contract/index';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@tests/helpers/component';
import { mockProcedure, mockProcedureFailure } from '@tests/mocks/contract';
import { MOCK_AUTOMATIONS } from '@tests/mocks/handlers/automations';
import { server } from '@tests/mocks/server';
import { delay } from 'msw';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import AutomationsPage from '../index.page';

// Isolate SWR cache per test
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('AutomationsPage', () => {
  it('shows error count badge when automations have lastRun.status === "error"', async () => {
    render(<AutomationsPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/1 error/i)).toBeInTheDocument();
    });
  });

  describe('first-run guidance', () => {
    it('leads with "Connect a source" as the current step when no provider is configured', async () => {
      server.use(mockProcedure(contract.providers.list, () => []));

      render(<AutomationsPage />, { wrapper: Wrapper });

      const current = await screen.findByRole('listitem', { current: 'step' });
      expect(current).toHaveTextContent('Connect a source');
      expect(within(current).getByRole('link', { name: /settings/i })).toHaveAttribute(
        'href',
        '/settings'
      );
    });

    it('opens the automation builder from the "Create an automation" step once a source and a query exist', async () => {
      server.use(
        mockProcedure(contract.automations.list, () => []),
        mockProcedure(contract.providers.tasks, () => [])
      );

      render(<AutomationsPage />, { wrapper: Wrapper });

      const current = await screen.findByRole('listitem', { current: 'step' });
      expect(current).toHaveTextContent('Create an automation');
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

      await userEvent.click(within(current).getByRole('button', { name: /new automation/i }));

      expect(await screen.findAllByRole('button', { name: /cancel/i })).not.toHaveLength(0);
    });

    it('asks for an automation when only system automations exist', async () => {
      server.use(
        mockProcedure(contract.automations.list, ({ request }) =>
          new URL(request.url).searchParams.get('kind') === 'user'
            ? []
            : MOCK_AUTOMATIONS.map((a) => ({ ...a, kind: 'system' as const }))
        )
      );

      render(<AutomationsPage />, { wrapper: Wrapper });

      const current = await screen.findByRole('listitem', { current: 'step' });
      expect(current).toHaveTextContent('Create an automation');
    });

    it('shows no guidance once a source, a query and an automation exist', async () => {
      render(<AutomationsPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Nightly cleanup')).toBeInTheDocument());

      expect(screen.queryByRole('list', { name: 'Setup' })).not.toBeInTheDocument();
    });

    it('keeps first-run instructions out of the empty automations list', async () => {
      server.use(
        mockProcedure(contract.automations.list, () => []),
        mockProcedure(contract.mediaQueries.list, () => [])
      );

      render(<AutomationsPage />, { wrapper: Wrapper });

      expect(await screen.findByText('No automations yet')).toBeInTheDocument();
      expect(screen.queryByText(/save a query from the media page/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/select a query above/i)).not.toBeInTheDocument();
    });

    it('keeps first-run instructions out of the empty queries list', async () => {
      server.use(mockProcedure(contract.mediaQueries.list, () => []));

      render(<AutomationsPage />, { wrapper: Wrapper });

      expect(await screen.findByText('No queries yet')).toBeInTheDocument();
      expect(screen.queryByText(/save as query/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /go to media/i })).toHaveLength(1);
    });

    it.each([
      ['providers', contract.providers.list],
      ['sources', contract.media.sources],
      ['queries', contract.mediaQueries.list],
      ['automations', contract.automations.list],
    ])('shows no guidance while the %s are still loading', async (_name, procedure) => {
      // Every fact resolves to empty, so setup is incomplete; guidance is only withheld because
      // one answer is still in flight.
      server.use(
        mockProcedure(procedure, async () => {
          await delay(300);
          return [];
        }),
        mockProcedure(contract.providers.list, () => [])
      );

      render(<AutomationsPage />, { wrapper: Wrapper });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.queryByRole('list', { name: 'Setup' })).not.toBeInTheDocument();

      expect(await screen.findByRole('list', { name: 'Setup' })).toBeInTheDocument();
    });

    it.each([
      ['providers', contract.providers.list],
      ['sources', contract.media.sources],
      ['queries', contract.mediaQueries.list],
      ['automations', contract.automations.list],
    ])('shows no guidance when the %s fail to load', async (_name, procedure) => {
      // Every other fact says setup is incomplete, so any guidance shown would be a guess.
      server.use(
        mockProcedureFailure(procedure, 500),
        mockProcedure(contract.providers.list, () => [])
      );

      render(<AutomationsPage />, { wrapper: Wrapper });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(screen.getByRole('heading', { name: 'Queries' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Setup' })).not.toBeInTheDocument();
    });
  });

  // Last in the file: Run now schedules revalidation timers (see useAutomations) that outlive the
  // test's SWR cache, so a later test running past them would hit the torn-down cache.
  it('POSTs /:id/run when a Run-now control is clicked', async () => {
    let runUrl = '';
    server.use(
      mockProcedure(contract.automations.run, ({ request }) => {
        runUrl = request.url;
        return null;
      })
    );

    render(<AutomationsPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Nightly cleanup')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Run now')[0]);

    await waitFor(() =>
      expect(runUrl).toMatch(new RegExp(`/api/automations/${MOCK_AUTOMATIONS[0].id}/run$`))
    );
  });
});
