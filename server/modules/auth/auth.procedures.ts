import { api } from '@server/kernel/api';
import { UnauthorizedError } from '@server/kernel/errors';
import type { AuthService } from './authService';

export function createAuthProcedures({ authService }: { authService: AuthService }) {
  return {
    plexLogin: api.auth.plexLogin.handler(async ({ input, context }) => {
      const user = await authService.authenticateWithPlex(input.authToken);
      if (context.session) {
        context.session.userId = user.id;
      }
      return user;
    }),

    me: api.auth.me.handler(async ({ context }) => {
      if (!context.user) {
        throw new UnauthorizedError('Not authenticated');
      }
      return context.user;
    }),

    logout: api.auth.logout.handler(
      ({ context }) =>
        new Promise<{ success: boolean }>((resolve, reject) => {
          context.session.destroy((err) => {
            if (err) reject(err);
            else resolve({ success: true });
          });
        })
    ),
  };
}
