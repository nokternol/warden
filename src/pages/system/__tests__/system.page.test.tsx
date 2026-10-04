import type { AutomationDto } from '@app/hooks/useAutomations';
import { contract } from '@contract/index';
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
