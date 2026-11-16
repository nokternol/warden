import type { MetadataProvider } from '@server/database/schema';
import type { MetadataProviderType } from '@server/database/schema';
import type { Logger } from 'winston';
import type { ProviderConfig } from './connections/baseProviderConnection';
import { JellyfinProvider } from './connections/jellyfinProvider';
import type { OmdbProvider } from './connections/omdbProvider';
import { PlexProvider } from './connections/plexProvider';
import type { RadarrProvider } from './connections/radarrProvider';
import { SeerrProvider } from './connections/seerrProvider';
import type { SonarrProvider } from './connections/sonarrProvider';
import { TautulliProvider } from './connections/tautulliProvider';
import { TmdbProvider } from './connections/tmdbProvider';
import { TvMazeProvider } from './connections/tvmazeProvider';
import { PROVIDER_CLASSES } from './providerClasses';
import type {
  JellyfinLinks,
  MovieSource,
  PlexLinks,
  ProviderCapabilities,
  SeriesSource,
  TitleLookup,
} from './roles';

/** A stored provider row: what a role query reads to choose and construct connections. */
type ProviderRow = { id: number; type: MetadataProviderType } & ProviderConfig;

/** A constructed connection playing one role, named by the provider row it came from. */
interface RoleInstance<Role> {
  providerId: number;
  name: string;
  provider: Role;
}

type ProviderClasses = typeof PROVIDER_CLASSES;

/** The provider types whose declared capabilities set `capability` to `value`. */
type TypeDeclaring<Capability extends keyof ProviderCapabilities, Value> = {
  [T in keyof ProviderClasses]: ProviderClasses[T]['catalogueEntry']['capabilities'] extends {
    [C in Capability]: Value;
  }
    ? T
    : never;
}[keyof ProviderClasses];

/** Narrows provider rows to those whose type declares `capability` as `value`. */
function declaring<
  Capability extends keyof ProviderCapabilities,
  const Value extends ProviderCapabilities[Capability],
>(capability: Capability, value: Value) {
  return <Row extends ProviderRow>(
    row: Row
  ): row is Row & { type: TypeDeclaring<Capability, Value> } => {
    const declared: ProviderCapabilities = PROVIDER_CLASSES[row.type].catalogueEntry.capabilities;
    return declared[capability] === value;
  };
}

/**
 * Every row whose type declares `capability` as `value`, with its connection, typed by the
 * instances of the classes that declare it.
 */
function connectionsDeclaring<
  Capability extends keyof ProviderCapabilities,
  const Value extends ProviderCapabilities[Capability],
>(rows: ProviderRow[], capability: Capability, value: Value, logger: Logger) {
  return rows.filter(declaring(capability, value)).map((row) => ({
    providerId: row.id,
    name: row.name,
    provider: connect(row, logger),
  }));
}

/**
 * The connection for a row, typed by the class its type maps to. TypeScript cannot follow a
 * generic key through `new PROVIDER_CLASSES[type]`, so the typed signature is an overload of the
 * one construction; the class map holds each type's class, so the two agree.
 */
function connect<T extends MetadataProviderType>(
  row: ProviderRow & { type: T },
  logger: Logger
): InstanceType<ProviderClasses[T]>;
function connect(row: ProviderRow, logger: Logger): AnyProvider {
  return new PROVIDER_CLASSES[row.type](row, logger);
}

/** Every concrete provider the factory can construct from settings. */
export type AnyProvider =
  | RadarrProvider
  | SonarrProvider
  | PlexProvider
  | JellyfinProvider
  | TautulliProvider
  | SeerrProvider
  | TmdbProvider
  | OmdbProvider
  | TvMazeProvider;

/**
 * Active providers resolved into typed, named slots — absent types stay undefined.
 * Carries only the types the single-active invariant still guarantees are singular;
 * catalog sources are constructed by the role queries instead, which never collapse
 * same-type instances into one slot.
 */
export interface ProviderSet {
  plex?: PlexProvider;
  jellyfin?: JellyfinProvider;
  tautulli?: TautulliProvider;
  seerr?: SeerrProvider;
  tmdb?: TmdbProvider;
}

export interface IProviderFactory {
  create(provider: { type: MetadataProviderType } & ProviderConfig, logger: Logger): AnyProvider;
}

export class ProviderFactory implements IProviderFactory {
  /** Construct a single provider from its settings. The one place providers are `new`ed. */
  create(provider: { type: MetadataProviderType } & ProviderConfig, logger: Logger): AnyProvider {
    return new PROVIDER_CLASSES[provider.type](provider, logger);
  }

  /** Every row whose type declares the movie source, with its connection. */
  movieSourcesOf(rows: ProviderRow[], logger: Logger): Array<RoleInstance<MovieSource>> {
    return connectionsDeclaring(rows, 'source', 'movie', logger);
  }

  /** Every row whose type declares the series source, with its connection. */
  seriesSourcesOf(rows: ProviderRow[], logger: Logger): Array<RoleInstance<SeriesSource>> {
    return connectionsDeclaring(rows, 'source', 'series', logger);
  }

  /** The row whose type is the media server for `plexRatingKey` links, with its connection. */
  plexServerOf(rows: ProviderRow[], logger: Logger): RoleInstance<PlexLinks> | undefined {
    return connectionsDeclaring(rows, 'mediaServer', 'plexRatingKey', logger)[0];
  }

  /** The row whose type is the media server for `jellyfinItemId` links, with its connection. */
  jellyfinServerOf(rows: ProviderRow[], logger: Logger): RoleInstance<JellyfinLinks> | undefined {
    return connectionsDeclaring(rows, 'mediaServer', 'jellyfinItemId', logger)[0];
  }

  /** Resolve a list of active provider settings into typed, named slots. */
  createMany(providers: MetadataProvider[], logger: Logger): ProviderSet {
    const set: ProviderSet = {};
    for (const settings of providers) {
      const provider = this.create(settings, logger);
      if (provider instanceof PlexProvider) set.plex = provider;
      else if (provider instanceof JellyfinProvider) set.jellyfin = provider;
      else if (provider instanceof TautulliProvider) set.tautulli = provider;
      else if (provider instanceof SeerrProvider) set.seerr = provider;
      else if (provider instanceof TmdbProvider) set.tmdb = provider;
    }
    return set;
  }

  /**
   * The title lookup, configured for the public TVmaze API from its catalogue entry. TVmaze is
   * keyless, so no configured provider is required.
   */
  tvMazeLookup(logger: Logger): TitleLookup {
    const { label, defaultUrl } = TvMazeProvider.catalogueEntry;
    return new TvMazeProvider(
      { name: label, url: defaultUrl, apiKey: null, settings: null },
      logger
    );
  }
}
