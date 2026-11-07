import type { DrizzleDb } from '@server/kernel/db';
import { AutomationRunService } from '@server/modules/automations/automationRunService';
import { RunHistoryEnrichmentOutcome } from '@server/modules/automations/enrichmentOutcome';
import { EnrichmentQueries } from '@server/modules/media/enrichment/enrichment.queries';
import { FilterReadiness } from '@server/modules/media/filterReadiness';
import { ProviderSettingsService } from '@server/modules/providers';

/** Filter readiness over `db`, wired as the container wires it. */
export function filterReadinessOver(db: DrizzleDb): FilterReadiness {
  return new FilterReadiness({
    providerSettingsService: new ProviderSettingsService({ db }),
    enrichmentQueries: new EnrichmentQueries({ db }),
    enrichmentOutcomeSource: new RunHistoryEnrichmentOutcome({
      automationRunService: new AutomationRunService({ db }),
    }),
  });
}
