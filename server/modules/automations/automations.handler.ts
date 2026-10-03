import { AutomationSchema } from '@contract/schemas';
import { defineRoute } from '@server/kernel/defineRoute';
import { isAuthenticated } from '@server/kernel/middleware/auth';
import { z } from 'zod';
import { getChildLogger } from '../../kernel/logger';
import type { AutomationExecutor } from './automationExecutor';
import type { AutomationRunService } from './automationRunService';
import type { AutomationScheduler } from './automationScheduler';
import type { AutomationService } from './automationService';
import { automationSchemas } from './automations.schemas';

const log = getChildLogger('AutomationHandler');

interface Cradle {
  automationService: AutomationService;
  automationRunService: AutomationRunService;
  automationScheduler: AutomationScheduler;
  automationExecutor: AutomationExecutor;
}

export function createAutomationHandlers(cradle: Cradle) {
  const { automationService, automationRunService, automationScheduler, automationExecutor } =
    cradle;

  return {
    list: [
      isAuthenticated(),
      defineRoute({
        schemas: { ...automationSchemas.list, response: z.array(AutomationSchema) },
        handler: async ({ query }) => automationService.list({ kind: query.kind }),
      }),
    ],

    create: [
      isAuthenticated(),
      defineRoute({
        schemas: { ...automationSchemas.create, response: AutomationSchema },
        handler: async ({ body }) => {
          const automation = await automationService.create(body);
          automationScheduler.schedule({
            id: automation.id,
            name: automation.name,
            schedule: automation.schedule,
          });
          return automation;
        },
      }),
    ],

    updateStatus: [
      isAuthenticated(),
      defineRoute({
        schemas: { ...automationSchemas.updateStatus, response: AutomationSchema },
        handler: async ({ params, body }) => {
          const automation = await automationService.updateStatus(params.id, body.status);
          if (body.status === 'active') {
            automationScheduler.schedule({
              id: automation.id,
              name: automation.name,
              schedule: automation.schedule,
            });
          } else {
            automationScheduler.unschedule(automation.id);
          }
          return automation;
        },
      }),
    ],

    delete: [
      isAuthenticated(),
      defineRoute({
        schemas: automationSchemas.delete,
        handler: async ({ params }) => {
          automationScheduler.unschedule(params.id);
          await automationService.delete(params.id);
          return null;
        },
      }),
    ],

    run: [
      isAuthenticated(),
      defineRoute({
        schemas: { ...automationSchemas.run, response: z.null() },
        handler: async ({ params, res }) => {
          await automationService.getById(params.id);
          void automationExecutor.execute(params.id).catch((err) => {
            log.error('Background automation run failed', { automationId: params.id, err });
          });
          res.status(202);
          return null;
        },
      }),
    ],

    listRuns: [
      isAuthenticated(),
      defineRoute({
        schemas: automationSchemas.listRuns,
        handler: async ({ query }) => {
          const data = await automationRunService.listRuns(query);
          return { data, total: data.length };
        },
      }),
    ],
  };
}
