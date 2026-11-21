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
