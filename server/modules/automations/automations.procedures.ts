import { api } from '@server/kernel/api';
import { getChildLogger } from '@server/kernel/logger';
import type { AutomationExecutor } from './automationExecutor';
import type { AutomationService } from './automationService';

const log = getChildLogger('AutomationProcedures');

interface Cradle {
  automationService: AutomationService;
  automationExecutor: AutomationExecutor;
}

export function createAutomationProcedures({ automationService, automationExecutor }: Cradle) {
  return api.automations.router({
    list: api.automations.list.handler(async ({ input }) =>
      automationService.list({ kind: input.kind })
    ),

    run: api.automations.run.handler(async ({ input }) => {
      await automationService.getById(input.id);
      void automationExecutor.execute(input.id).catch((err) => {
        log.error('Background automation run failed', { automationId: input.id, err });
      });
      return null;
    }),
  });
}
