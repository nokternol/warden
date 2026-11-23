import { MetadataProviderType } from '@server/database/schema';
import type { Logger } from 'winston';
import type { BaseProviderConnection, ProviderConfig } from './connections/baseProviderConnection';
import { JellyfinProvider } from './connections/jellyfinProvider';
import { OmdbProvider } from './connections/omdbProvider';
import { PlexProvider } from './connections/plexProvider';
import { RadarrProvider } from './connections/radarrProvider';
import { SeerrProvider } from './connections/seerrProvider';
import { SonarrProvider } from './connections/sonarrProvider';
import { TautulliProvider } from './connections/tautulliProvider';
import { TmdbProvider } from './connections/tmdbProvider';
import { TvMazeProvider } from './connections/tvmazeProvider';
import type {
  AddressColumn,
  FactReporter,
  JellyfinLinks,
  MovieSource,
  PlexLinks,
  ProviderCapabilities,
  ProviderTypeEntry,
  SeriesSource,
} from './roles';

/** The role interfaces a class must construct, given the capabilities it declares. */
type RolesDeclaredBy<C extends ProviderCapabilities> = (C extends { source: 'movie' }
  ? MovieSource
  : unknown) &
  (C extends { source: 'series' } ? SeriesSource : unknown) &
  (C extends { mediaServer: 'plexRatingKey' } ? PlexLinks : unknown) &
  (C extends { mediaServer: 'jellyfinItemId' } ? JellyfinLinks : unknown) &
  (C extends { facts: object } ? FactReporter : unknown);

/**
 * Whether a type declaring `facts` can be ranked and matched: it resolves to a kind (is a media
 * server, or declares `providerKind`) and to a title id column (has an address column, or declares
 * `matchedBy`). A type declaring no facts needs neither.
 */
type ReporterResolves<C> = C extends { facts: object }
  ? C extends { mediaServer: AddressColumn } | { providerKind: string }
    ? C extends
        | { mediaServer: AddressColumn }
        | { addressedBy: AddressColumn }
        | { facts: { matchedBy: 'tmdbId' } }
      ? true
      : false
    : false
  : true;

/** A connection class carrying its catalogue entry, whose instances play `Roles`. */
type ProviderClass<Roles = unknown> = {
  readonly catalogueEntry: ProviderTypeEntry;
  new (config: ProviderConfig, logger: Logger): BaseProviderConnection & Roles;
};

/**
 * A map from provider type to connection class in which each class constructs the role
 * interfaces its `catalogueEntry.capabilities` declare, and each fact reporter resolves to a kind
 * and a title id column.
 */
export type CheckedClassMap<M> = {
  [K in keyof M]: K extends MetadataProviderType
    ? M[K] extends { readonly catalogueEntry: { readonly capabilities: infer C } }
      ? C extends ProviderCapabilities
        ? ReporterResolves<C> extends true
          ? ProviderClass<RolesDeclaredBy<C>>
          : never
        : never
      : ProviderClass
    : never;
};

/** The one map from provider type to its connection class, in display order. */
export const PROVIDER_CLASSES = defineProviderClasses({
  [MetadataProviderType.PLEX]: PlexProvider,
  [MetadataProviderType.JELLYFIN]: JellyfinProvider,
  [MetadataProviderType.RADARR]: RadarrProvider,
  [MetadataProviderType.SONARR]: SonarrProvider,
  [MetadataProviderType.TAUTULLI]: TautulliProvider,
  [MetadataProviderType.SEERR]: SeerrProvider,
  [MetadataProviderType.TMDB]: TmdbProvider,
  [MetadataProviderType.OMDB]: OmdbProvider,
  [MetadataProviderType.TVMAZE]: TvMazeProvider,
});

/**
 * Builds a class map, refusing at compile time a class whose instances do not implement the role
 * interfaces its declared capabilities require.
 */
export function defineProviderClasses<M extends CheckedClassMap<M>>(m: M): M {
  return m;
}
