import {
  type AppSettingsCradle,
  registerAppSettingsDependencies,
} from '@server/modules/appSettings';
import { type AuthCradle, registerAuthDependencies } from '@server/modules/auth';
import {
  type AutomationsCradle,
  registerAutomationsDependencies,
} from '@server/modules/automations';
import { type MediaCradle, registerMediaDependencies } from '@server/modules/media';
import {
  type MediaQueriesCradle,
  registerMediaQueriesDependencies,
} from '@server/modules/mediaQueries';
import {
  type ProvidersCradle,
  registerProvidersDependencies,
} from '@server/modules/providers/index';
import { type SystemCradle, registerSystemDependencies } from '@server/modules/system';
import type { AwilixContainer } from 'awilix';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './kernel/config';
import { type KernelCradle, createKernelContainer } from './kernel/container';
import type { DrizzleDb } from './kernel/db';
import { getChildLogger } from './kernel/logger';

const log = getChildLogger('Container');

/**
 * Registered dependencies available via the container.
 * Extend this interface when adding new services.
 */
export interface Cradle
  extends KernelCradle,
    AppSettingsCradle,
    AuthCradle,
    AutomationsCradle,
    MediaCradle,
    MediaQueriesCradle,
    ProvidersCradle,
    SystemCradle {}

let container: AwilixContainer<Cradle> | null = null;

/**
 * Build the DI container with runtime dependencies. This is assembly: it
 * starts from the kernel mechanism (`createKernelContainer`), then registers
 * each module's dependencies on top. Call once during server startup after
 * config and DB are initialized.
 */
export function buildContainer(deps: {
  config: AppConfig;
  db: DrizzleDb;
}): AwilixContainer<Cradle> {
  container = createKernelContainer<Cradle>(deps);

  registerAppSettingsDependencies(container);
  registerAuthDependencies(container);
  registerAutomationsDependencies(container);
  registerMediaDependencies(container);
  registerMediaQueriesDependencies(container);
  registerProvidersDependencies(container);
  registerSystemDependencies(container);

  log.info('Container built', {
    registrations: Object.keys(container.registrations),
  });

  return container;
}

/**
 * Get the built container. Throws if buildContainer() hasn't been called.
 */
export function getContainer(): AwilixContainer<Cradle> {
  if (!container) {
    throw new Error('Container not built. Call buildContainer() at startup.');
  }
  return container;
}

/**
 * Express middleware that creates a scoped container per request.
 * The scoped container inherits all registrations and can have
 * request-specific values added (e.g., requestId, user).
 */
export function scopePerRequest(req: Request, _res: Response, next: NextFunction): void {
  const scopedContainer = getContainer().createScope();
  req.scope = scopedContainer;
  next();
}
