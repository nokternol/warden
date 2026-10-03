import { contract } from '@contract/index';
import type { AutomationDto, AutomationStatus, MediaQueryRecord } from '@contract/schemas';
import { mockProcedure } from '../contract';

export const MOCK_AUTOMATIONS: AutomationDto[] = [
  {
    id: 1,
    name: 'Nightly cleanup',
    kind: 'user',
    query: { id: 1, name: 'Unwatched movies', contentType: 'movie' },
    querySources: [{ queryId: 1, role: 'include', sortOrder: 0 }],
    provider: { id: 1, name: 'Radarr Main', type: 'RADARR' },
    taskId: 'radarr.deleteUnmonitored',
    schedule: '0 2 * * *',
    status: 'active',
    lastRun: { at: '2026-06-03T02:00:00Z', itemCount: 3, status: 'success' },
    nextRun: '2026-06-04T02:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Weekly report',
    kind: 'user',
    query: { id: 2, name: 'All series', contentType: 'show' },
    querySources: [{ queryId: 2, role: 'include', sortOrder: 0 }],
    provider: { id: 1, name: 'Radarr Main', type: 'RADARR' },
    taskId: 'radarr.deleteUnmonitored',
    schedule: '0 2 * * 0',
    status: 'active',
    lastRun: { at: '2026-06-01T02:00:00Z', itemCount: 0, status: 'error', error: 'Timeout' },
    nextRun: '2026-06-08T02:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const automationsHandlers = [
  mockProcedure(contract.automations.list, () => MOCK_AUTOMATIONS),

  mockProcedure(contract.automations.create, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const created: AutomationDto = {
      id: 99,
      name: String(body.name),
      kind: 'user',
      query: { id: Number(body.queryId), name: 'Query', contentType: 'movie' as const },
      querySources: [{ queryId: Number(body.queryId), role: 'include', sortOrder: 0 }],
      provider: { id: Number(body.providerId), name: 'Radarr Main', type: 'RADARR' },
      taskId: String(body.taskId),
      schedule: String(body.schedule),
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return created;
  }),

  mockProcedure(contract.automations.updateStatus, async ({ params, request }) => {
    const body = (await request.json()) as { status: AutomationStatus };
    const base = MOCK_AUTOMATIONS.find((a) => a.id === Number(params.id)) ?? MOCK_AUTOMATIONS[0];
    return { ...base, status: body.status };
  }),

  mockProcedure(contract.automations.delete, () => null),

  mockProcedure(contract.automations.run, () => null),
];

const MOCK_HEALTH = { status: 'healthy' as const, providerStatus: [], qualificationIssues: [] };

export const MOCK_MEDIA_QUERIES: MediaQueryRecord[] = [
  {
    id: 1,
    name: 'Unwatched movies',
    contentType: 'movie' as const,
    filterValues: [],
    health: MOCK_HEALTH,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'All series',
    contentType: 'show' as const,
    filterValues: [],
    health: MOCK_HEALTH,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const mediaQueriesHandlers = [
  mockProcedure(contract.mediaQueries.list, () => MOCK_MEDIA_QUERIES),

  mockProcedure(contract.mediaQueries.create, async ({ request }) => {
    const body = (await request.json()) as Pick<
      MediaQueryRecord,
      'name' | 'contentType' | 'filterValues'
    >;
    return {
      id: 99,
      name: body.name,
      contentType: body.contentType,
      filterValues: body.filterValues ?? [],
      health: MOCK_HEALTH,
      createdAt: new Date().toISOString(),
    };
  }),

  mockProcedure(contract.mediaQueries.delete, () => null),

  mockProcedure(contract.mediaQueries.preview, ({ params }) => {
    const count = Number(params.id) === 1 ? 42 : 14;
    return { count, instances: [{ providerId: 1, name: 'Radarr Main', count }] };
  }),
];
