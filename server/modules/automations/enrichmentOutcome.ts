import type { AutomationRunStatus } from '@contract/schemas';
import type { EnrichmentOutcomeSource } from '../media';
import type { AutomationRunService } from './automationRunService';

const ENRICHMENT_TASK_ID = 'system:enrichment';

/** The latest enrichment run's outcome, read from the run history this module owns. */
export class RunHistoryEnrichmentOutcome implements EnrichmentOutcomeSource {
  private readonly automationRunService: Pick<AutomationRunService, 'latestStatusOfTask'>;

  constructor(deps: { automationRunService: Pick<AutomationRunService, 'latestStatusOfTask'> }) {
    this.automationRunService = deps.automationRunService;
  }

  latestEnrichmentStatus(): Promise<AutomationRunStatus | undefined> {
    return this.automationRunService.latestStatusOfTask(ENRICHMENT_TASK_ID);
  }
}
