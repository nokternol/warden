import { z } from 'zod';
import { base } from './base';
import { AutomationSchema, emptyToUndefined } from './schemas';

export const automations = {
  list: base
    .route({ method: 'GET', path: '/api/automations' })
    .input(z.object({ kind: emptyToUndefined(z.enum(['user', 'system'])) }))
    .output(z.array(AutomationSchema)),
};
