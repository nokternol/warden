import { api } from '@server/kernel/api';
import { getChildLogger } from '@server/kernel/logger';
import type { AutomationExecutor } from './automationExecutor';
import type { AutomationRunService } from './automationRunService';
import type { AutomationScheduler } from './automationScheduler';
import type { AutomationService } from './automationService';

const log = getChildLogger('AutomationProcedures');

interface Cradle {
  automationService: AutomationService;
  automationRunService: AutomationRunService;
  automationScheduler: AutomationScheduler;
  automationExecutor: AutomationExecutor;
}

export function createAutomationProcedures(cradle: Cradle) {
  const { automationService, automationRunService, automationScheduler, automationExecutor } =
    cradle;

  return api.automations.router({
    list: api.automations.list.handler(async ({ input }) =>
      automationService.list({ kind: input.kind })
    ),

    create: api.automations.create.handler(async ({ input }) => {
      const automation = await automationService.create(input);
      automationScheduler.schedule({
        id: automation.id,
        name: automation.name,
        schedule: automation.schedule,
      });
      return automation;
    }),

    updateStatus: api.automations.updateStatus.handler(async ({ input }) => {
      const automation = await automationService.updateStatus(input.id, input.status);
      if (input.status === 'active') {
        automationScheduler.schedule({
          id: automation.id,
          name: automation.name,
          schedule: automation.schedule,
        });
      } else {
        automationScheduler.unschedule(automation.id);
      }
      return automation;
    }),

    delete: api.automations.delete.handler(async ({ input }) => {
      automationScheduler.unschedule(input.id);
      await automationService.delete(input.id);
      return null;
    }),

    run: api.automations.run.handler(async ({ input }) => {
      await automationService.getById(input.id);
      void automationExecutor.execute(input.id).catch((err) => {
        log.error('Background automation run failed', { automationId: input.id, err });
      });
      return null;
    }),

    runs: api.automations.runs.handler(async ({ input }) => {
      const data = await automationRunService.listRuns(input);
      return { data, total: data.length };
    }),

    runItems: api.automations.runItems.handler(async ({ input }) =>
      automationRunService.listRunItems(input.runId, input)
    ),
  });
}
