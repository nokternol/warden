import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { contract } from '@contract/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import RunRow from '../index';

const run: AutomationRunDto = {
  id: 50,
  automationId: 1,
  automationName: 'Nightly',
  ranAt: '2026-06-04T02:00:00.000Z',
  status: 'error',
  itemCount: 150,
  error: `Connection refused ${'x'.repeat(120)} at the end`,
  createdAt: '2026-06-04T02:00:00.000Z',
};

const row = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <table>
        <tbody>
          <RunRow run={run} />
        </tbody>
      </table>
    </SWRConfig>
  );

describe('RunRow details', () => {
  it('shows the whole error without hover', () => {
    row();
    expect(screen.getByText(/at the end$/)).toBeInTheDocument();
  });

  it('reaches every item beyond the first page', async () => {
    server.use(
      mockProcedure(contract.automations.runItems, ({ request }) => {
        const url = new URL(request.url);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 100);
        const all = Array.from({ length: 150 }, (_, i) => ({
          mediaItemId: i,
          title: `Title ${i}`,
          year: null,
          deleted: false,
        }));
        return { data: all.slice(offset, offset + limit), total: 150 };
      })
    );
    const user = userEvent.setup();
    row();
    await user.click(screen.getByRole('button', { name: 'Show items' }));
    expect(await screen.findByText('Title 99')).toBeInTheDocument();
    expect(screen.getByText(/showing 100 of 150/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more items' }));
    expect(await screen.findByText('Title 149')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more items' })).not.toBeInTheDocument();
  });

  it('says so when more items fail to load, keeping those already shown', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get('*/api/automations/runs/50/items', () => {
        calls += 1;
        if (calls > 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({
          status: 'ok',
          data: {
            data: Array.from({ length: 100 }, (_, i) => ({
              mediaItemId: i,
              title: `Title ${i}`,
              year: 2000,
              deleted: false,
            })),
            total: 150,
          },
        });
      })
    );
    row();
    await user.click(screen.getByRole('button', { name: 'Show items' }));
    expect(await screen.findByText('Title 99')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more items' }));
    expect(await screen.findByText(/couldn.t load more items/i)).toBeInTheDocument();
    expect(screen.getByText('Title 99')).toBeInTheDocument();
  });
});
