import { type AwilixContainer, type NameAndRegistrationPair, asClass } from 'awilix';
import { AutomationBlockService } from './automationBlockService';
import { AutomationExecutor } from './automationExecutor';
import { AutomationRunService } from './automationRunService';
import { AutomationScheduler } from './automationScheduler';
import { AutomationService } from './automationService';
import { RunHistoryEnrichmentOutcome } from './enrichmentOutcome';

/**
 * What the automations module contributes to the app container. The app
 * builder (`server/container.ts`) extends its `Cradle` from this slice;
 * consumers inject these by cradle name and type against the interface's
 * type exports.
 */
export interface AutomationsCradle {
  automationService: AutomationService;
  automationRunService: AutomationRunService;
  automationBlockService: AutomationBlockService;
  automationExecutor: AutomationExecutor;
  automationScheduler: AutomationScheduler;
  /** `media`'s filter readiness reads the enrichment outcome through this. */
  enrichmentOutcomeSource: RunHistoryEnrichmentOutcome;
}

/**
 * Register the module's dependencies on the app container. Registration is
 * module-owned so a class needs no value export on the public interface
 * unless consumers construct it directly.
 */
export function registerAutomationsDependencies<TCradle extends AutomationsCradle>(
  container: AwilixContainer<TCradle>
): void {
  const registrations: NameAndRegistrationPair<AutomationsCradle> = {
    automationService: asClass(AutomationService).singleton(),
    automationRunService: asClass(AutomationRunService).singleton(),
    automationBlockService: asClass(AutomationBlockService).singleton(),
    automationExecutor: asClass(AutomationExecutor).singleton(),
    automationScheduler: asClass(AutomationScheduler).singleton(),
    enrichmentOutcomeSource: asClass(RunHistoryEnrichmentOutcome).singleton(),
  };
  // TCradle extends AutomationsCradle, so the slice's keys and resolver types
  // are a subset of the app pair type.
  container.register(registrations as NameAndRegistrationPair<TCradle>);
}
