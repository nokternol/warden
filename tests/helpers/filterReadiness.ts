import type { DrizzleDb } from '@server/kernel/db';
import { FilterReadiness } from '@server/modules/media/filterReadiness';
import { ProviderSettingsService } from '@server/modules/providers';

/** Filter readiness over `db`, wired as the container wires it. */
export function filterReadinessOver(db: DrizzleDb): FilterReadiness {
  return new FilterReadiness({ providerSettingsService: new ProviderSettingsService({ db }), db });
}
