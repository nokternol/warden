import type { AutomationDto } from '@app/hooks/useAutomations';
import { contract } from '@contract/index';
import type { RefreshRecord } from '@contract/media';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@tests/helpers/component';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import SystemPage from '../index.page';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const SYSTEM_AUTOMATIONS: AutomationDto[] = [
  {
    id: 101,
    name: 'Identity Resolution',
    kind: 'system',
    query: null,
    provider: null,
    queries: [],
    taskId: 'system:identity-resolution',
    schedule: '0 */6 * * *',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 102,
    name: 'Enrichment',
    kind: 'system',
    query: null,
    provider: null,
    queries: [],
    taskId: 'system:enrichment',
    schedule: '0 3 * * *',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function useSystemList() {
  server.use(
    mockProcedure(contract.automations.list, ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind');
      return kind === 'system' ? SYSTEM_AUTOMATIONS : [];
    })
  );
}

describe('SystemPage', () => {
  it('says how current the library copy is beside the title count, naming a failed provider', async () => {
    useSystemList();
    const page = (records: RefreshRecord[]) => ({
      items: [],
      totalCount: 3,
      page: 1,
      pageSize: 1,
      yearRange: { min: null, max: null },
      records,
      findings: [],
      mediaPage: 'clear' as const,
    });
    const radarr = {
      providerId: 1,
      provider: 'Radarr',
      kind: 'catalog' as const,
      refreshedAt: 1_794_800_000,
      failedAt: null,
      error: null,
    };
    const tautulli = {
      providerId: 3,
      provider: 'Tautulli',
      kind: 'facts' as const,
      refreshedAt: null,
      failedAt: 1_794_800_000,
      error: 'down',
    };
    server.use(
      mockProcedure(contract.media.browse.movie, () => page([radarr, tautulli])),
      mockProcedure(contract.media.browse.series, () => page([tautulli]))
    );

    render(<SystemPage />, { wrapper: Wrapper });

    const line = await screen.findByRole('status', { name: 'How current this is' });
    expect(line.textContent).toMatch(/^As of .* · Tautulli's data failed to refresh$/);
  });

  it('lists the seeded system automations each with a Run-now control', async () => {
    useSystemList();

    render(<SystemPage />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Identity Resolution')).toBeInTheDocument());
    expect(screen.getByText('Enrichment')).toBeInTheDocument();
    expect(screen.getAllByTitle('Run now')).toHaveLength(2);
  });

  it('POSTs /:id/run when a Run-now control is clicked', async () => {
    useSystemList();
    let runUrl = '';
    server.use(
      mockProcedure(contract.automations.run, ({ request }) => {
        runUrl = request.url;
        return null;
      })
    );

    render(<SystemPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Identity Resolution')).toBeInTheDocument());

    await userEvent.click(screen.getAllByTitle('Run now')[0]);

    await waitFor(() => expect(runUrl).toMatch(/\/api\/automations\/101\/run$/));
  });
});
