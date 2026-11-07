import { type AwilixContainer, type NameAndRegistrationPair, asClass } from 'awilix';
import { ActiveFieldSetCache } from './activeFieldSet';
import { EnrichmentQueries } from './enrichment/enrichment.queries';
import { EnrichmentJobFactory } from './enrichmentJobFactory';
import { FilterReadiness } from './filterReadiness';
import { MediaQueryEngine } from './mediaQueryEngine';
import { MediaSourceFactory } from './mediaSourceFactory';

/**
 * What the media module contributes to the app container. The app builder
 * (`server/container.ts`) extends its `Cradle` from this slice; consumers
 * inject these by cradle name and type against the interface's type exports.
 */
export interface MediaCradle {
  mediaQueryEngine: MediaQueryEngine;
  enrichmentJobFactory: EnrichmentJobFactory;
  enrichmentQueries: EnrichmentQueries;
  mediaSourceFactory: MediaSourceFactory;
  activeFieldSetCache: ActiveFieldSetCache;
  filterReadiness: FilterReadiness;
}

/**
 * Register the module's dependencies on the app container. Registration is
 * module-owned so a class needs no value export on the public interface
 * unless consumers construct it directly.
 */
export function registerMediaDependencies<TCradle extends MediaCradle>(
  container: AwilixContainer<TCradle>
): void {
  const registrations: NameAndRegistrationPair<MediaCradle> = {
    mediaQueryEngine: asClass(MediaQueryEngine).singleton(),
    enrichmentJobFactory: asClass(EnrichmentJobFactory).singleton(),
    enrichmentQueries: asClass(EnrichmentQueries).singleton(),
    mediaSourceFactory: asClass(MediaSourceFactory).singleton(),
    activeFieldSetCache: asClass(ActiveFieldSetCache).singleton(),
    filterReadiness: asClass(FilterReadiness).singleton(),
  };
  // TCradle extends MediaCradle, so the slice's keys and resolver types
  // are a subset of the app pair type.
  container.register(registrations as NameAndRegistrationPair<TCradle>);
}
