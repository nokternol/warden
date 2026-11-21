import type { DrizzleDb } from '@server/kernel/db';
import { DomainEventBus } from '@server/kernel/eventBus';
import { FilterReadiness } from '@server/modules/media/filterReadiness';
import { LibraryCache } from '@server/modules/media/libraryCache';
import { ProviderSettingsService } from '@server/modules/providers';
import { providerSettingsCollaborators } from '@tests/helpers/collaborators';

/**
 * Filter readiness over `db`, wired as the container wires it. Each read loads the library copy
 * afresh, so a test that changes refresh records between reads sees the change.
 */
export function filterReadinessOver(db: DrizzleDb): FilterReadiness {
  return new FilterReadiness({
    providerSettingsService: new ProviderSettingsService({
      ...providerSettingsCollaborators(),
      db,
    }),
    libraryCache: { read: () => new LibraryCache({ db, eventBus: new DomainEventBus() }).read() },
  });
}
