import { type AwilixContainer, type NameAndRegistrationPair, asClass, asValue } from 'awilix';
import type { PrecedenceCoverageValidator } from '../providers';
import { ActiveFieldSetCache, fieldsByProviderType } from './activeFieldSet';
import { EnrichmentQueries } from './enrichment/enrichment.queries';
import { assertContestedFieldsCovered, contestedFieldPrecedence } from './enrichment/precedence';
import { EnrichmentJobFactory } from './enrichmentJobFactory';
import { FilterReadiness } from './filterReadiness';
import { LibraryCache } from './libraryCache';
import { MediaQueryEngine } from './mediaQueryEngine';

/**
 * What the media module contributes to the app container. The app builder
 * (`server/container.ts`) extends its `Cradle` from this slice; consumers
 * inject these by cradle name and type against the interface's type exports.
 */
export interface MediaCradle {
  mediaQueryEngine: MediaQueryEngine;
  enrichmentJobFactory: EnrichmentJobFactory;
  enrichmentQueries: EnrichmentQueries;
  activeFieldSetCache: ActiveFieldSetCache;
  filterReadiness: FilterReadiness;
  libraryCache: LibraryCache;
  /**
   * The check `ProviderSettingsService` runs before activating a provider: every contested field's
   * precedence order keeps an active producer. Media owns the precedence it checks; providers
   * types the hook and never imports media.
   */
  precedenceCoverageValidator: PrecedenceCoverageValidator;
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
    activeFieldSetCache: asClass(ActiveFieldSetCache).singleton(),
    filterReadiness: asClass(FilterReadiness).singleton(),
    libraryCache: asClass(LibraryCache).singleton(),
    precedenceCoverageValidator: asValue((activeTypes) =>
      assertContestedFieldsCovered(activeTypes, contestedFieldPrecedence, fieldsByProviderType)
    ),
  };
  // TCradle extends MediaCradle, so the slice's keys and resolver types
  // are a subset of the app pair type.
  container.register(registrations as NameAndRegistrationPair<TCradle>);
}
