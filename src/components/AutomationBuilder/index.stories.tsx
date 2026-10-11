import type { AutomationPreview } from '@app/hooks/useAutomationPreview';
import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import type { ProviderSummary } from '@app/hooks/useProviderSettings';
import type { ProviderTaskAvailability } from '@app/hooks/useProviderTasks';
import { api } from '@app/lib/api/client';
import { apiKey } from '@app/lib/api/useApi';
import type { ProviderTaskOptionsAvailability, TaskOptionsRoute } from '@contract/providers';
import type { Story } from '@ladle/react';
import { type Middleware, SWRConfig, unstable_serialize } from 'swr';
import AutomationBuilder from './index';

// Stories drive the real hooks from a preloaded SWR cache (no network), keyed
// exactly as `useApi` keys the procedures the hooks call, so each state is
// deterministic for the visual pass. The count request is answered by
// `answerPreview` instead.
function makeProvider(overrides: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    id: 1,
    type: 'RADARR',
    name: 'Radarr Main',
    url: 'http://localhost:7878/api/v3',
    apiKey: '***',
    settings: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const queries: MediaQueryRecord[] = [
  {
    id: 1,
    name: 'Old Movies',
    contentType: 'movie',
    filters: [{ ruleKey: 'yearMax', value: 2015 }],
    health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
    createdAt: '2024-01-01T00:00:00Z',
  },
];

/** How the builder's count request is answered: with a count, never, or with a failure. */
type PreviewAnswer = AutomationPreview | 'pending' | 'failed';

/**
 * Answers the builder's count request in place of the API. The request is
 * matched by its procedure's identity, since a serialized fallback key for a
 * function is not stable across Ladle's module graph.
 */
function answerPreview(answer: PreviewAnswer): Middleware {
  const fetchAnswer = () =>
    answer === 'pending'
      ? new Promise<never>(() => {})
      : answer === 'failed'
        ? Promise.reject(new Error('Preview unavailable'))
        : Promise.resolve(answer);
  return (useSWRNext) => (key, fetcher, config) => {
    const isPreview = Array.isArray(key) && key[0] === api.automations.preview;
    return isPreview
      ? useSWRNext(key, fetchAnswer as typeof fetcher, { ...config, revalidateOnMount: true })
      : useSWRNext(key, fetcher, config);
  };
}

function withData(
  providers: ProviderSummary[],
  availability: ProviderTaskAvailability[],
  taskOptions: Partial<Record<TaskOptionsRoute, ProviderTaskOptionsAvailability[]>> = {},
  preview: PreviewAnswer = 'pending'
): React.ReactNode {
  const optionsFallback = Object.fromEntries(
    Object.entries(taskOptions).map(([route, data]) => [
      unstable_serialize(apiKey(api.providers.taskOptions, { route: route as TaskOptionsRoute })),
      data,
    ])
  );
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        fallback: {
          [unstable_serialize(apiKey(api.providers.list, undefined))]: providers,
          [unstable_serialize(apiKey(api.providers.tasks, undefined))]: availability,
          ...optionsFallback,
        },
        use: [answerPreview(preview)],
        revalidateOnMount: false,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        revalidateIfStale: false,
      }}
    >
      <div className="max-w-2xl p-6">
        <AutomationBuilder
          queries={queries}
          onSubmit={() => {}}
          onCancel={() => {}}
          isSubmitting={false}
        />
      </div>
    </SWRConfig>
  );
}

export const Populated: Story = () =>
  withData(
    [
      makeProvider({ id: 1, name: 'Radarr Main' }),
      makeProvider({ id: 2, type: 'SONARR', name: 'Sonarr Main' }),
    ],
    [
      {
        providerId: 1,
        type: 'RADARR',
        tasks: [
          { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
          {
            id: 'triggerSearch',
            label: 'Trigger download search',
            destructive: false,
            enabled: true,
          },
          {
            id: 'deleteMovieWithFiles',
            label: 'Delete movie + files',
            destructive: true,
            enabled: true,
          },
        ],
      },
      {
        providerId: 2,
        type: 'SONARR',
        tasks: [
          { id: 'unmonitorSeries', label: 'Unmonitor series', destructive: false, enabled: true },
        ],
      },
    ]
  );

const destructiveProviders = [makeProvider({ id: 1, name: 'Radarr Main' })];
const destructiveAvailability: ProviderTaskAvailability[] = [
  {
    providerId: 1,
    type: 'RADARR',
    tasks: [
      { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
      {
        id: 'deleteMovieWithFiles',
        label: 'Delete movie + files',
        destructive: true,
        enabled: true,
      },
    ],
  },
];

/** Select "Delete movie + files": the confirmation states the exact count and gates saving. */
export const DestructiveTask: Story = () =>
  withData(destructiveProviders, destructiveAvailability, {}, { count: 214, contentType: 'movie' });

/** Select "Delete movie + files": a count of one is singular. */
export const DestructiveTaskSingular: Story = () =>
  withData(destructiveProviders, destructiveAvailability, {}, { count: 1, contentType: 'movie' });

/** Select "Delete movie + files": the count has not answered yet, so no number is shown. */
export const DestructiveTaskCounting: Story = () =>
  withData(destructiveProviders, destructiveAvailability);

/** Select "Delete movie + files": the count request fails, and the confirmation says so. */
export const DestructiveTaskCountFailed: Story = () =>
  withData(destructiveProviders, destructiveAvailability, {}, 'failed');

export const MultipleInstances: Story = () =>
  withData(
    [makeProvider({ id: 1, name: 'Radarr 4K' }), makeProvider({ id: 2, name: 'Radarr 1080p' })],
    [
      {
        providerId: 1,
        type: 'RADARR',
        tasks: [
          { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
        ],
      },
      {
        providerId: 2,
        type: 'RADARR',
        tasks: [
          {
            id: 'deleteMovieWithFiles',
            label: 'Delete movie + files',
            destructive: true,
            enabled: true,
          },
        ],
      },
    ]
  );

export const ParameterizedTask: Story = () =>
  withData(
    [makeProvider({ id: 1, name: 'Radarr Main' })],
    [
      {
        providerId: 1,
        type: 'RADARR',
        tasks: [
          {
            id: 'changeQualityProfile',
            label: 'Change quality profile',
            destructive: false,
            enabled: true,
            parameter: {
              type: 'select',
              label: 'Quality profile',
              optionsRoute: 'quality-profiles',
            },
          },
        ],
      },
    ],
    {
      'quality-profiles': [
        {
          providerId: 1,
          type: 'RADARR',
          options: [
            { id: '1', label: 'HD-1080p' },
            { id: '2', label: 'Any' },
          ],
        },
      ],
    }
  );

export const Empty: Story = () =>
  withData(
    [makeProvider()],
    [
      {
        providerId: 1,
        type: 'RADARR',
        tasks: [
          {
            id: 'deleteMovieWithFiles',
            label: 'Delete movie + files',
            destructive: true,
            enabled: false,
          },
        ],
      },
    ]
  );
