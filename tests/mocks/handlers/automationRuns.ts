import { contract } from '@contract/index';
import type { AutomationRunDto, RunItemDto } from '@contract/schemas';
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

/** What each mock run targeted, keyed by run id; one item has since left its source. */
export const mockRunItems: Record<number, RunItemDto[]> = {
  1: [
    { mediaItemId: 11, title: 'Alien', year: 1979, deleted: false },
    { mediaItemId: 12, title: 'Brazil', year: 1985, deleted: false },
    { mediaItemId: 13, title: 'Collateral', year: 2004, deleted: false },
    { mediaItemId: 14, title: 'Heat', year: 1995, deleted: true },
    { mediaItemId: 15, title: 'Ronin', year: 1998, deleted: false },
  ],
  2: [],
};

/** One page of `rows`, windowed by the request's `limit`/`offset` search params. */
function pageOf<T>(request: Request, rows: T[]): { data: T[]; total: number } {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  return { data: rows.slice(offset, offset + limit), total: rows.length };
}

export const automationRunHandlers = [
  mockProcedure(contract.automations.runs, ({ request }) => pageOf(request, mockRuns)),
  mockProcedure(contract.automations.runItems, ({ params, request }) =>
    pageOf(request, mockRunItems[Number(params.runId)] ?? [])
  ),
];
