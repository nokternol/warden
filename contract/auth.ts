import { z } from 'zod';
import { base } from './base';
import { IsoDateSchema } from './schemas';

/** The signed-in user, without their Plex token. */
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  plexUsername: z.string().nullable(),
  plexId: z.number().nullable(),
  avatar: z.string().nullable(),
  userType: z.string(),
  isActive: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export const auth = {
  /** Signs in with a Plex auth token and starts a session. */
  plexLogin: base
    .meta({ public: true })
    .route({ method: 'POST', path: '/api/auth/plex' })
    .input(z.object({ authToken: z.string().min(1, 'Auth token required') }))
    .output(UserSchema),

  me: base.route({ method: 'GET', path: '/api/auth/me' }).output(UserSchema),

  /** Ends the current session. */
  logout: base
    .meta({ public: true })
    .route({ method: 'POST', path: '/api/auth/logout' })
    .output(z.object({ success: z.boolean() })),
};

export type User = z.infer<typeof UserSchema>;
