import type { ProviderTypeDescriptor, TaskOptionsRoute } from '@contract/providers';
import type { ContentType } from '@contract/schemas';
import type { MetadataProviderType } from '@server/database/schema';
import type { RadarrMovie } from './connections/radarrProvider';
import type { SonarrSeries } from './connections/sonarrProvider';

/** A title's media-server id columns, as the catalog refresh links them. */
export type AddressColumn = 'plexRatingKey' | 'jellyfinItemId';

/**
 * What a provider type can do beyond running tasks, declared once on its connection class:
 *  - `source`: owns that content type's catalog;
 *  - `mediaServer`: is the media server that titles' `<column>` links point into, and addresses
 *    titles by that column;
 *  - `addressedBy`: addresses titles by a column it is not the media server for.
 * Running tasks is declared by implementing `MediaActuator`.
 */
export interface ProviderCapabilities {
  readonly source?: ContentType;
  readonly mediaServer?: AddressColumn;
  readonly addressedBy?: AddressColumn;
}

/**
 * A provider type's catalogue entry, carried by its connection class as `catalogueEntry`: how
 * the type is presented and reached (the contract's provider type descriptor, less `type`, which
 * the class map's key supplies) and what it can do.
 */
export type ProviderTypeEntry = Readonly<
  Omit<ProviderTypeDescriptor, 'type' | 'filterData' | 'hostPlaceholder' | 'defaultUrl'>
> &
  ProviderAddress & {
    readonly filterData: readonly string[];
    readonly capabilities: ProviderCapabilities;
  };

/**
 * Where a provider type is reached: a self-hosted type gives an example host for the owner to
 * enter; a hosted type, with no host to enter, carries the one URL every instance uses.
 */
type ProviderAddress =
  | { readonly hostPlaceholder: string; readonly defaultUrl?: undefined }
  | { readonly defaultUrl: string; readonly hostPlaceholder?: undefined };

/**
 * The source role: a connection that owns a content type's catalog. These are the setup lists the
 * catalog refresh keeps for it (Sonarr also answers language profiles); `MovieSource` and
 * `SeriesSource` add the catalog itself. A class declaring `source` must construct one.
 */
export interface MediaSource {
  getTags(): Promise<Array<{ id: number; label: string }>>;
  getProfiles(): Promise<Array<{ id: number; name: string }>>;
  getRootFolders(): Promise<Array<{ id: number; path: string }>>;
  getLanguageProfiles?(): Promise<Array<{ id: number; name: string }>>;
}

/** The source of the movie catalog. */
export interface MovieSource extends MediaSource {
  getMovies(): Promise<RadarrMovie[]>;
}

/** The source of the series catalog. */
export interface SeriesSource extends MediaSource {
  getSeries(): Promise<SonarrSeries[]>;
}

/** The media server `plexRatingKey` links point into: every item, with the ids that link it. */
export interface PlexLinks {
  getAllItems(): Promise<Array<{ ratingKey: string; type?: string; Guid?: { id: string }[] }>>;
}

/** The media server `jellyfinItemId` links point into: every item, with the ids that link it. */
export interface JellyfinLinks {
  getAllItems(): Promise<
    Array<{ Id: string; Type?: string; ProviderIds?: Record<string, string> }>
  >;
}

/** Resolves a series' TVmaze id from its TheTVDB id, for the catalog refresh. */
export interface TitleLookup {
  lookupByTvdbId(tvdbId: number): Promise<{ id: number } | null>;
}

/** One field within a `fields`-shaped parameter — see `ActuatorTaskParameter`. */
export interface ActuatorTaskParameterField {
  key: string;
  label: string;
  kind: 'select' | 'text' | 'boolean';
  /** Present when `kind` is `'select'` — see `ActuatorTaskParameter`'s `optionsRoute`. */
  optionsRoute?: TaskOptionsRoute;
}

/**
 * Declares the value(s) a task takes, carried with the automation and passed
 * to `run` at execution time. Discovery surfaces read this to know a value
 * must be captured with the task, and how to render its control:
 *  - `select`: one value chosen from a live provider-fetched list (a quality
 *    profile, a tag, a collection). `optionsRoute` names the all-instances-
 *    keyed discovery route (shaped like `getTasks`) the client fetches
 *    choices from.
 *  - `text`: one freeform string value (e.g. a comment body).
 *  - `fields`: more than one value, each its own `select`/`text`/`boolean` —
 *    JSON-encoded together as the task's single transported parameter string.
 * The value always transports as a string — numeric id spaces parse their own.
 */
export type ActuatorTaskParameter =
  | { type: 'select'; label: string; optionsRoute: TaskOptionsRoute }
  | { type: 'text'; label: string }
  | { type: 'fields'; label: string; fields: ActuatorTaskParameterField[] };

/**
 * The pure-data projection of an actuator task: how it is presented (`id`,
 * `label`, `destructive`), what data scope it touches (`affects`), and the
 * parameter it requires, if any. This is the transport and discovery shape —
 * it serializes complete, carrying no runner.
 */
export interface ActuatorTaskDescriptor {
  id: string;
  label: string;
  destructive: boolean;
  /**
   * `'media'` declares that, by the time `run` returns, the task has changed library data in
   * the upstream service: which titles exist, monitored state, files, quality profile, tags,
   * play state, collection membership, metadata — anything the library copy holds. Leave it
   * off only when the task changes no library data by the time `run` returns, such as a task
   * that starts an upstream background command (search, refresh, rescan) whose effect lands
   * later. If unsure, declare it.
   *
   * Nothing reads this yet: the library copy changes only on the scheduled catalog refresh and
   * enrichment. It is the declaration a refresh of what a run just changed will read (#256).
   * `actuatorTaskAffects.test.ts` lists every task that leaves it off, so a new task must
   * take a side.
   */
  affects?: 'media';
  parameter?: ActuatorTaskParameter;
}

/**
 * An id in the actuator's own addressing space: source-native numeric ids for
 * catalog-owning actuators (Radarr/Sonarr), `plexRatingKey` strings for
 * Plex-addressed systems (Plex, Tautulli), `jellyfinItemId` strings for
 * Jellyfin. The executor guarantees the space by construction — a task never
 * receives an id it cannot address.
 */
export type ActuatorTargetId = number | string;

/**
 * A descriptor plus its runner, bound to the concrete provider instance (no
 * cast). The execution shape: the executor reads `run`, discovery reads the
 * descriptor it extends — projecting one from the other is lossless.
 */
export interface ActuatorTask extends ActuatorTaskDescriptor {
  run(ids: ActuatorTargetId[], parameterValue?: string): Promise<void>;
}

/**
 * Guards a parameterized task's runner: a declared-parameter task invoked
 * without its value rejects loudly instead of acting on a default — the
 * missing value is a wiring bug (the automation should have stored it), never
 * a case to paper over.
 */
export function requireParameter(taskId: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`Task "${taskId}" requires a parameter value`);
  }
  return value;
}

/**
 * The runner for a modelled task: a capability declared in the right shape but
 * not yet wired to a real provider call. It rejects on invocation so a modelled
 * task is never silently a no-op; enablement defaulting off keeps it
 * unreachable by accident.
 */
export function modelledRun(taskId: string): (ids: ActuatorTargetId[]) => Promise<void> {
  return () => Promise.reject(new Error(`Task "${taskId}" is not yet implemented`));
}

/**
 * A system that exposes an API to perform actions on media it can address. It
 * is the sole authority for what actuator tasks exist: a configured instance
 * declares its own tasks, each carrying a runner bound to this instance. A
 * system without this role has no tasks by construction.
 */
export interface MediaActuator {
  readonly actuatorType: MetadataProviderType;
  tasks(): ActuatorTask[];
}

/** Whether a constructed provider plays the `MediaActuator` role. */
export function isMediaActuator(provider: object): provider is MediaActuator {
  return typeof (provider as Partial<MediaActuator>).tasks === 'function';
}
