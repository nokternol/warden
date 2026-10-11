import { contract } from '@contract/index';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@tests/helpers/component';
import { mockProcedure } from '@tests/mocks/contract';
import { MOCK_AUTOMATIONS } from '@tests/mocks/handlers/automations';
import { server } from '@tests/mocks/server';
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

    it('shows no guidance once a source, a query and an automation exist', async () => {
      render(<AutomationsPage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByText('Nightly cleanup')).toBeInTheDocument());

      expect(screen.queryByRole('list', { name: 'Setup' })).not.toBeInTheDocument();
    });

    it.each([
      ['providers', contract.providers.list],
      ['sources', contract.media.sources],
      ['queries', contract.mediaQueries.list],
      ['automations', contract.automations.list],
    ])('shows no guidance while the %s are still loading', async (_name, procedure) => {
      // Every other fact says setup is incomplete, so any guidance shown would be a guess.
      server.use(
        mockProcedure(procedure, () => new Promise<never>(() => {})),
        mockProcedure(contract.providers.list, () => [])
      );

      render(<AutomationsPage />, { wrapper: Wrapper });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(screen.queryByRole('list', { name: 'Setup' })).not.toBeInTheDocument();
    });
  });
});
