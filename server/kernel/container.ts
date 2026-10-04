import { type Scope, scope } from '@contract/scope';
import { type AwilixContainer, InjectionMode, asClass, asValue, createContainer } from 'awilix';
import type { AppConfig } from './config';
import type { DrizzleDb } from './db';
import { DomainEventBus } from './eventBus';

/**
 * Dependencies the kernel itself contributes to the app container. Modules
 * extend this with their own cradle slices; the app builder
 * (`server/container.ts`) composes the full `Cradle` from all of them.
 */
export interface KernelCradle {
  config: AppConfig;
  db: DrizzleDb;
  eventBus: DomainEventBus;
  /** The scope declaration: what Warden does not expose. */
  scope: Scope;
}

/**
 * Create the app container and register the kernel's dependencies. This is
 * the container *mechanism* — infrastructure with no domain meaning. What
 * goes into the container beyond the kernel is declared by each module's
 * `register<Module>Dependencies` and composed by the app builder, which is
 * assembly rather than kernel: it imports every module, so it can never live
 * here.
 */
export function createKernelContainer<TCradle extends KernelCradle>(deps: {
  config: AppConfig;
  db: DrizzleDb;
}): AwilixContainer<TCradle> {
  const container = createContainer<KernelCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    config: asValue(deps.config),
    db: asValue(deps.db),
    eventBus: asClass(DomainEventBus).singleton(),
    scope: asValue(scope),
  });

  // The remaining TCradle keys are filled by module registrations before the
  // container is used; strict mode fails fast at resolve time if one is missed.
  return container as AwilixContainer<TCradle>;
}
