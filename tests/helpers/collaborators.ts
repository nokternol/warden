import type { MetadataProviderType } from '@server/database/schema';
import { DomainEventBus } from '@server/kernel/eventBus';
import { MediaQueryEngine } from '@server/modules/media/mediaQueryEngine';
import { ProviderFactory } from '@server/modules/providers/providerFactory';

/**
 * The collaborators an `AutomationExecutor` needs beyond the services a test builds itself: a real
 * provider factory and query engine, a fresh event bus, and a system task runner that runs nothing.
 * A test spreads this first and overrides whichever collaborator it observes.
 */
export function executorCollaborators() {
  return {
    providerFactory: new ProviderFactory(),
    mediaQueryEngine: new MediaQueryEngine(),
    systemTaskRunner: { run: async (_taskId: string) => 0 },
    eventBus: new DomainEventBus(),
  };
}

/**
 * The collaborators a `ProviderSettingsService` needs beside its database: a fresh event bus. A
 * test that observes it passes its own after the spread.
 */
export function providerSettingsCollaborators() {
  return { eventBus: new DomainEventBus() };
}

/**
 * A catalog refresh run with nothing to read: no sources, no active media server, a TVmaze lookup
 * that finds nothing and no pause between lookups. A test spreads this first and passes the
 * sources it reads.
 */
export function emptyCatalogRun() {
  return {
    movieSources: [],
    seriesSources: [],
    listSources: [],
    plexSource: undefined,
    jellyfinSource: undefined,
    tvMazeLookup: { lookupByTvdbId: async (_tvdbId: number) => null },
    delay: async (_ms: number) => {},
  };
}
