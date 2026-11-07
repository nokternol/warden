import { Router } from 'express';
import type { Cradle } from '../container';
import { api, serveApi } from '../kernel/api';
import { checkUser } from '../kernel/middleware/auth';
import { createAppSettingsProcedures } from './appSettings';
import { createAuthProcedures } from './auth';
import { createAutomationProcedures } from './automations';
import {
  createBackdropsProcedures,
  createMediaProcedures,
  createRulesProcedures,
  createSearchProcedures,
} from './media';
import { createMediaQueryProcedures } from './mediaQueries';
import { createProvidersProcedures } from './providers';
import { createSystemProcedures } from './system';

/**
 * Creates the API router: every procedure of the API contract, implemented by
 * the modules and served at its contract path. `api.router` checks the
 * assembly against the contract, so a procedure no module implements fails to
 * compile.
 */
export function createApiRouter(cradle: Cradle) {
  const router = Router();

  // Attach user to all requests (if session exists)
  router.use(checkUser);

  const media = createMediaProcedures(cradle);

  router.use(
    serveApi(
      api.router({
        appSettings: createAppSettingsProcedures(cradle),
        auth: createAuthProcedures(cradle),
        automations: createAutomationProcedures(cradle),
        media: {
          ...media.procedures,
          ...createRulesProcedures(cradle),
          ...createSearchProcedures(cradle),
          ...createBackdropsProcedures(cradle),
        },
        mediaQueries: createMediaQueryProcedures(cradle),
        providers: createProvidersProcedures(cradle),
        system: createSystemProcedures(cradle),
      }),
      { authBypass: cradle.config.BYPASS_AUTH, scope: cradle.scope }
    )
  );

  // A path under /api that names no procedure ends here, so it never falls through to the
  // web app's HTML "Page not found" page.
  router.use((_req, res) => {
    res.status(404).json({
      status: 'error',
      error: { type: 'NOT_FOUND', message: 'No API procedure at this path' },
    });
  });

  return router;
}
