import { z } from 'zod';
import { base } from './base';
import { AutomationSchema, IdSchema, emptyToUndefined } from './schemas';

export const automations = {
  list: base
    .route({ method: 'GET', path: '/api/automations' })
    .input(z.object({ kind: emptyToUndefined(z.enum(['user', 'system'])) }))
    .output(z.array(AutomationSchema)),

  /** Starts a run in the background; answers 202 once the automation is known to exist. */
  run: base
    .route({ method: 'POST', path: '/api/automations/{id}/run', successStatus: 202 })
    .input(z.object({ id: IdSchema }))
    .output(z.null()),
};
