import { api } from '@server/kernel/api';
import type { AutomationService } from './automationService';

interface Cradle {
  automationService: AutomationService;
}

export function createAutomationProcedures({ automationService }: Cradle) {
  return api.automations.router({
    list: api.automations.list.handler(async ({ input }) =>
      automationService.list({ kind: input.kind })
    ),
  });
}
