import { Router } from 'express';
import type { Cradle } from '../container';
import { serveApi } from '../kernel/api';
import { checkUser } from '../kernel/middleware/auth';
import { createAppSettingsRoutes } from './appSettings';
import { createAuthRoutes } from './auth';
import { createAutomationProcedures } from './automations';
import {
  createBackdropsRoutes,
  createFilterFieldsRoutes,
  createMediaHandlers,
  createMediaRoutes,
  createSearchRoutes,
} from './media';
import { createMediaQueryRoutes } from './mediaQueries';
import { createProvidersRoutes } from './providers';
import { createSettingsRoutes } from './settings';
import { createSystemProcedures } from './system';

const route = (path: string) => `/${path}`;
export const routes = {
  appSettings: route('app-settings'),
  backdrops: route('backdrops'),
  filterFields: route('filter-fields'),
  media: route('media'),
  mediaQueries: route('media-queries'),
  providers: route('providers'),
  settings: route('settings'),
  auth: route('auth'),
  search: route('search'),
} as const;

/**
 * Creates the API router with all module routes mounted.
 * The cradle provides injected dependencies to every module.
 *
 * Media handlers are built once so their `invalidateMediaCaches` function
 * can be shared with the settings handler — provider mutations bust stale
 * movies/series/tags/profiles/genres/networks cache entries immediately.
 */
export function createApiRouter(cradle: Cradle) {
  const router = Router();

  // Attach user to all requests (if session exists)
  router.use(checkUser);

  // Build media handlers once so the invalidator can be shared.
  const mediaHandlers = createMediaHandlers(cradle);
  const { invalidateMediaCaches } = mediaHandlers;

  // Contract procedures first; requests they don't match fall through to the
  // Express routers below.
  router.use(
    serveApi({
      automations: createAutomationProcedures(cradle),
      system: createSystemProcedures(cradle),
    })
  );

  // Mount modules
  router.use(routes.appSettings, createAppSettingsRoutes(cradle));
  router.use(routes.backdrops, createBackdropsRoutes(cradle));
  router.use(routes.auth, createAuthRoutes(cradle));
  router.use(routes.providers, createProvidersRoutes(cradle));
  router.use(routes.settings, createSettingsRoutes(cradle, invalidateMediaCaches));
  router.use(routes.media, createMediaRoutes(cradle, mediaHandlers));
  router.use(routes.search, createSearchRoutes(cradle));
  router.use(routes.filterFields, createFilterFieldsRoutes(cradle));
  router.use(routes.mediaQueries, createMediaQueryRoutes(cradle));

  return router;
}
