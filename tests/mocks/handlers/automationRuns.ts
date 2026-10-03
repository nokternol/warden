import { contract } from '@contract/index';
import type { AutomationRunDto } from '@contract/schemas';
import { mockProcedure } from '../contract';

export const mockRuns: AutomationRunDto[] = [
  {
    id: 1,
    automationId: 1,
    automationName: 'Nightly Cleanup',
    ranAt: '2026-06-04T02:00:00.000Z',
    status: 'success',
    itemCount: 5,
    error: null,
    createdAt: '2026-06-04T02:00:00.000Z',
  },
  {
    id: 2,
    automationId: 1,
    automationName: 'Nightly Cleanup',
    ranAt: '2026-06-03T02:00:00.000Z',
    status: 'error',
    itemCount: 0,
    error: 'Connection refused',
    createdAt: '2026-06-03T02:00:00.000Z',
  },
];

export const automationRunHandlers = [
  mockProcedure(contract.automations.runs, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    return { data: mockRuns.slice(offset, offset + limit), total: mockRuns.length };
  }),
];
