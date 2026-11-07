/**
 * Every actuator task takes a side on `affects: 'media'`.
 *
 * Run: vitest run --project server
 */
import { type MetadataProvider, MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { isMediaActuator } from '@server/modules/providers/roles';
import { describe, expect, it } from 'vitest';

const log = getChildLogger('actuator-task-affects-test');

/**
 * The actuator tasks that deliberately leave `affects` off. The rule (also at
 * `ActuatorTaskDescriptor.affects` in `roles.ts`):
 * - Declare `affects: 'media'` when, by the time `run` returns, the task has changed library
 *   data in the upstream service (titles, monitored state, files, quality profile, tags, play
 *   state, collection membership, metadata).
 * - Leave it off only when the task changes no library data by the time `run` returns — e.g.
 *   it starts an upstream background command (search, refresh, rescan) whose effect lands
 *   later. The cache expiry covers those.
 * - If unsure, declare it: over-eviction costs one refetch, under-eviction leaves the page stale.
 *
 * A new task without `affects` fails this test until the rule is applied to it, and so does a
 * listed task that gains `affects` or disappears.
 */
const UNDECLARED_BY_RULE = new Set([
  'RADARR:triggerSearch',
  'RADARR:refreshMovie',
  'RADARR:rescanMovie',
  'RADARR:refreshCollection',
  'SONARR:triggerSearch',
  'SONARR:refreshSeries',
  'SONARR:rescanSeries',
]);

function settingsFor(type: MetadataProviderType): MetadataProvider {
  return {
    id: 1,
    type,
    name: `Test ${type}`,
    url: 'http://localhost:9090',
    apiKey: 'test-key',
    settings: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Every provider the factory can build; types it doesn't build (e.g. keyless TVmaze) are skipped. */
function buildEveryProvider(): object[] {
  const factory = new ProviderFactory();
  return Object.values(MetadataProviderType).flatMap((type) => {
    try {
      return [factory.create(settingsFor(type), log)];
    } catch {
      return [];
    }
  });
}

describe('actuator task affects declarations', () => {
  it('leaves affects off exactly for the tasks the rule exempts', () => {
    const undeclared = new Set<string>();
    for (const provider of buildEveryProvider()) {
      if (!isMediaActuator(provider)) continue;
      for (const task of provider.tasks()) {
        if (task.affects === undefined) undeclared.add(`${provider.actuatorType}:${task.id}`);
      }
    }

    expect([...undeclared].sort()).toEqual([...UNDECLARED_BY_RULE].sort());
  });
});
