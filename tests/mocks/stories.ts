import type { AutomationReadiness } from '@contract/automations';
import { contract } from '@contract/index';
import type { RequestHandler } from 'msw';
import { worker } from './browser';
import { mockProcedure } from './contract';

/**
 * API answers a Ladle story needs beyond the shared handlers, by name. A story asks for a set by
 * setting `meta = { mocks: '<name>' }`; Ladle's global provider (`.ladle/components.tsx`) applies it
 * before the story renders. Stories live under `src/`, which the Next build type-checks without
 * `tests/`, so a story names its mocks rather than importing them.
 */
const storyMocks: Record<string, RequestHandler[]> = {
  /**
   * The library's latest read counts 100 movies; a read started now (`fresh=true`) counts 214. A
   * destructive Radarr task is offered, so Run Now asks for confirmation.
   */
  runNowStaleCopy: [
    mockProcedure(contract.providers.tasks, () => [
      {
        providerId: 1,
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
    ]),
    mockProcedure(contract.automations.readiness, () => readiness(214)),
  ],
};

function readiness(count: number): AutomationReadiness {
  return {
    schedule: 'runs',
    runNow: 'runs',
    blocks: { needsFix: [], awaitingSignOff: [], signedOff: [] },
    problems: [],
    count,
    contentType: 'movie',
    records: [
      {
        providerId: 1,
        provider: 'Radarr',
        kind: 'catalog',
        refreshedAt: 1_794_816_000,
        failedAt: null,
        error: null,
      },
      {
        providerId: 2,
        provider: 'Radarr 4K',
        kind: 'catalog',
        refreshedAt: 1_794_800_000,
        failedAt: 1_794_816_000,
        error: 'Timed out',
      },
    ],
  };
}

/**
 * Puts the browser worker back to the shared handlers, then adds the named story's set, so one
 * story's answers never reach the next. A name with no set is a typo in the story and throws.
 */
export function applyStoryMocks(name: string | undefined): void {
  worker.resetHandlers();
  if (name === undefined) return;
  const handlers = storyMocks[name];
  if (!handlers) throw new Error(`No story mocks named "${name}" in tests/mocks/stories.ts`);
  worker.use(...handlers);
}
