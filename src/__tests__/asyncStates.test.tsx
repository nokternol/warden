import { contract } from '@contract/index';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@tests/helpers/component';
import { mockProcedure, mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { delay } from 'msw';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import AutomationsPage from '../pages/automations/index.page';
import MediaPage from '../pages/media/index.page';
import RunsPage from '../pages/runs/index.page';
import SettingsPage from '../pages/settings/index.page';
import SystemPage from '../pages/system/index.page';

const page = (ui: React.ReactElement) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0, dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>
  );

const alertNaming = (what: RegExp) =>
  waitFor(() => {
    const alert = screen.getAllByRole('alert').find((el) => what.test(el.textContent ?? ''));
    expect(alert).toBeTruthy();
    return alert as HTMLElement;
  });

describe('a failed load says what failed and offers a retry, never an empty state', () => {
  it('Providers', async () => {
    server.use(mockProcedureFailure(contract.providers.list, 500));
    page(<SettingsPage />);
    await alertNaming(/couldn.t load providers/i);
    expect(screen.queryByText(/no providers configured/i)).not.toBeInTheDocument();
  });

  it('Automations', async () => {
    server.use(mockProcedureFailure(contract.automations.list, 500));
    page(<AutomationsPage />);
    await alertNaming(/couldn.t load automations/i);
    expect(screen.queryByText('No automations yet')).not.toBeInTheDocument();
  });

  it('Queries', async () => {
    server.use(mockProcedureFailure(contract.mediaQueries.list, 500));
    page(<AutomationsPage />);
    await alertNaming(/couldn.t load queries/i);
    expect(screen.queryByText('No queries yet')).not.toBeInTheDocument();
  });

  it('Runs', async () => {
    server.use(mockProcedureFailure(contract.automations.runs, 500));
    page(<RunsPage />);
    await alertNaming(/couldn.t load runs/i);
    expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();
  });

  it('System', async () => {
    server.use(mockProcedureFailure(contract.automations.list, 500));
    page(<SystemPage />);
    await alertNaming(/couldn.t load system automations/i);
    expect(screen.queryByText('No system automations')).not.toBeInTheDocument();
  });

  it('Media titles', async () => {
    server.use(mockProcedureFailure(contract.media.browse.movie, 500));
    page(<MediaPage />);
    await alertNaming(/couldn.t load movies/i);
    expect(screen.queryByText(/your movie library is empty/i)).not.toBeInTheDocument();
  });

  it('Media sources', async () => {
    server.use(mockProcedureFailure(contract.media.sources, 500));
    page(<MediaPage />);
    await alertNaming(/couldn.t load media sources/i);
  });

  it('retries and recovers', async () => {
    server.use(mockProcedureFailure(contract.automations.runs, 500));
    page(<RunsPage />);
    const alert = await alertNaming(/couldn.t load runs/i);

    server.use(mockProcedure(contract.automations.runs, () => ({ data: [], total: 0 })));
    await userEvent.click(alert.querySelector('button') as HTMLElement);

    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('loading never shows an empty state', () => {
  it('Automations shows row skeletons', async () => {
    server.use(
      mockProcedure(contract.automations.list, async () => {
        await delay('infinite');
        return [];
      })
    );
    page(<AutomationsPage />);
    expect(await screen.findAllByTestId('skeleton')).not.toHaveLength(0);
    expect(screen.queryByText('No automations yet')).not.toBeInTheDocument();
  });

  it('System shows row skeletons', async () => {
    server.use(
      mockProcedure(contract.automations.list, async () => {
        await delay('infinite');
        return [];
      })
    );
    page(<SystemPage />);
    expect(await screen.findAllByTestId('skeleton')).not.toHaveLength(0);
    expect(screen.queryByText('No system automations')).not.toBeInTheDocument();
  });
});

describe('a source that failed during a successful browse', () => {
  it('names the provider and its error above the results', async () => {
    server.use(
      mockProcedure(contract.media.browse.movie, () => ({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 48,
        yearRange: { min: null, max: null },
        errors: [{ provider: 'Radarr Main', error: 'Timed out' }],
      }))
    );
    page(<MediaPage />);
    await alertNaming(/radarr main.*timed out/i);
  });
});
