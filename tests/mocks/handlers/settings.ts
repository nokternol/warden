import { contract } from '@contract/index';
import type { ProviderDraft, ProviderPatch, ProviderTypeDescriptor } from '@contract/providers';
import type { ProviderSummary } from '@contract/schemas';
import { mockProcedure } from '../contract';

const mockProviders: ProviderSummary[] = [
  {
    id: 1,
    type: 'RADARR',
    name: 'Radarr Main',
    url: 'http://localhost:7878/api/v3',
    apiKey: '***',
    settings: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockProviderTypes: ProviderTypeDescriptor[] = [
  { type: 'PLEX', label: 'Plex', apiPath: '', capabilities: ['Library contents', 'Item metadata'] },
  {
    type: 'JELLYFIN',
    label: 'Jellyfin',
    apiPath: '',
    capabilities: ['Library contents', 'Item metadata'],
  },
  {
    type: 'RADARR',
    label: 'Radarr',
    apiPath: '/api/v3',
    capabilities: ['Movie library', 'Quality profiles', 'Tags'],
  },
  {
    type: 'SONARR',
    label: 'Sonarr',
    apiPath: '/api/v3',
    capabilities: ['Series library', 'Quality profiles', 'Tags'],
  },
  {
    type: 'TAUTULLI',
    label: 'Tautulli',
    apiPath: '',
    capabilities: ['Watch history', 'Play statistics', 'User activity'],
  },
  { type: 'OVERSEERR', label: 'Overseerr', apiPath: '', capabilities: ['Request queue'] },
];

export const settingsHandlers = [
  mockProcedure(contract.providers.types, () => mockProviderTypes),
  mockProcedure(contract.providers.list, () => mockProviders),

  mockProcedure(contract.providers.create, async ({ request }) => {
    const body = (await request.json()) as ProviderDraft;
    return {
      id: 2,
      type: body.type,
      name: body.name,
      url: body.url,
      apiKey: body.apiKey ? ('***' as const) : null,
      settings: null,
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }),

  mockProcedure(contract.providers.update, async ({ params, request }) => {
    const body = (await request.json()) as ProviderPatch;
    return {
      ...mockProviders[0],
      ...body,
      id: Number(params.id),
      settings: body.settings ?? mockProviders[0].settings,
      apiKey: '***' as const,
    };
  }),

  mockProcedure(contract.providers.delete, () => null),

  mockProcedure(contract.providers.test, () => ({ ok: true })),
];
