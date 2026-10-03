import { z } from 'zod';
import { base } from './base';

export const system = {
  health: base
    .meta({ public: true })
    .route({ method: 'GET', path: '/api/health' })
    .output(
      z.object({
        status: z.string(),
        timestamp: z.string(),
        version: z.string(),
        environment: z.string(),
      })
    ),
};
