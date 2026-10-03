import { z } from 'zod';
import { base } from './base';

export const AppSettingsSchema = z.object({
  region: z.string().nullable(),
  primaryMediaServer: z.enum(['PLEX', 'JELLYFIN']),
});

export const appSettings = {
  get: base.route({ method: 'GET', path: '/api/app-settings' }).output(AppSettingsSchema),

  update: base
    .route({ method: 'PATCH', path: '/api/app-settings' })
    .input(
      z.object({
        region: z
          .string()
          .regex(/^[A-Z]{2}$/, 'region must be an ISO 3166-1 alpha-2 code')
          .nullable()
          .optional(),
        primaryMediaServer: z.enum(['PLEX', 'JELLYFIN']).optional(),
      })
    )
    .output(AppSettingsSchema),
};
