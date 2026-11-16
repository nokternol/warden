import { type AwilixContainer, type NameAndRegistrationPair, asClass } from 'awilix';
import { CatalogRefreshJobFactory } from './catalogRefreshJobFactory';
import { PlexService } from './plexService';
import { ProviderFactory } from './providerFactory';
import { ProviderSettingsService } from './providerSettingsService';
import { TmdbService } from './tmdbService';

/**
 * What the providers module contributes to the app container. The app builder
 * (`server/container.ts`) extends its `Cradle` from this slice; consumers
 * inject these by cradle name and type against the interface's type exports.
 */
export interface ProvidersCradle {
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
  plexService: PlexService;
  tmdbService: TmdbService;
  catalogRefreshJobFactory: CatalogRefreshJobFactory;
}

/**
 * Register the module's dependencies on the app container. Registration is
 * module-owned so a class needs no value export on the public interface
 * unless consumers construct it directly.
 */
export function registerProvidersDependencies<TCradle extends ProvidersCradle>(
  container: AwilixContainer<TCradle>
): void {
  const registrations: NameAndRegistrationPair<ProvidersCradle> = {
    tmdbService: asClass(TmdbService).singleton(),
    plexService: asClass(PlexService).scoped(),
    providerSettingsService: asClass(ProviderSettingsService).singleton(),
    providerFactory: asClass(ProviderFactory).singleton(),
    catalogRefreshJobFactory: asClass(CatalogRefreshJobFactory).singleton(),
  };
  // TCradle extends ProvidersCradle, so the slice's keys and resolver types
  // are a subset of the app pair type.
  container.register(registrations as NameAndRegistrationPair<TCradle>);
}
