import { Router } from 'express';
import type { Cradle } from '../container';
import { serveApi } from '../kernel/api';
import { checkUser } from '../kernel/middleware/auth';
import { createAppSettingsRoutes } from './appSettings';
import { createAuthRoutes } from './auth';
import { createAutomationProcedures } from './automations';
import {
  createBackdropsRoutes,
  createMediaProcedures,
  createRulesProcedures,
  createSearchProcedures,
} from './media';
import { createMediaQueryProcedures } from './mediaQueries';
import { createProvidersProcedures } from './providers';
import { createProviderSettingsProcedures } from './settings';
import { createSystemProcedures } from './system';

const route = (path: string) => `/${path}`;
export const routes = {
  appSettings: route('app-settings'),
  backdrops: route('backdrops'),
  auth: route('auth'),
} as const;

/**
 * Creates the API router with all module routes mounted.
 * The cradle provides injected dependencies to every module.
 *
 * Media procedures are built once so their `invalidateMediaCaches` function
 * can be shared with the provider settings procedures — provider mutations
 * bust stale movies/series/tags/profiles/genres/networks cache entries
 * immediately.
 */
export function createApiRouter(cradle: Cradle) {
  const router = Router();

  // Attach user to all requests (if session exists)
  router.use(checkUser);

  // Build the media procedures once so their cache invalidator can be shared.
  const media = createMediaProcedures(cradle);
  const { invalidateMediaCaches } = media;

  // Contract procedures first; requests they don't match fall through to the
  // Express routers below.
  router.use(
    serveApi({
      automations: createAutomationProcedures(cradle),
      media: {
        ...media.procedures,
        ...createRulesProcedures(cradle),
        ...createSearchProcedures(cradle),
      },
      mediaQueries: createMediaQueryProcedures(cradle),
      providers: {
        ...createProvidersProcedures(cradle),
        ...createProviderSettingsProcedures(cradle, invalidateMediaCaches),
      },
      system: createSystemProcedures(cradle),
    })
  );

  // Mount modules
  router.use(routes.appSettings, createAppSettingsRoutes(cradle));
  router.use(routes.backdrops, createBackdropsRoutes(cradle));
  router.use(routes.auth, createAuthRoutes(cradle));

  return router;
}
