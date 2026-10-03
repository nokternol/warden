import type { NextFunction, Request, Response } from 'express';
import { getChildLogger } from '../logger';

const log = getChildLogger('AuthMiddleware');

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

/**
 * Attaches user to request if session exists (non-blocking). Requiring a
 * user is the API contract implementer's job (`server/kernel/api.ts`).
 */
export async function checkUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.session?.userId) {
      const { authService } = req.scope.cradle;
      const user = await authService.getUserById(req.session.userId);
      req.user = user;
      log.debug('User attached to request', {
        userId: user.id,
        requestId: req.requestId,
      });
    }
    next();
  } catch {
    // User not found - clear invalid session
    if (req.session) {
      req.session.userId = undefined;
    }
    next();
  }
}
