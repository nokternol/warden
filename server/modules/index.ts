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
 *
 * Media procedures are built once so their `invalidateMediaCaches` function
 * can be shared with the providers procedures — provider mutations
 * bust stale movies/series/tags/profiles/genres/networks cache entries
 * immediately.
 */
export function createApiRouter(cradle: Cradle) {
  const router = Router();

  // Attach user to all requests (if session exists)
  router.use(checkUser);

  const media = createMediaProcedures(cradle);
  const { invalidateMediaCaches } = media;

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
        providers: createProvidersProcedures(cradle, invalidateMediaCaches),
        system: createSystemProcedures(cradle),
      }),
      { authBypass: cradle.config.BYPASS_AUTH }
    )
  );

  return router;
}
