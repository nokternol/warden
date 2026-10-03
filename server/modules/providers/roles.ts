import { MetadataProviderType } from '@server/database/schema';

/** One field within a `fields`-shaped parameter — see `ActuatorTaskParameter`. */
export interface ActuatorTaskParameterField {
  key: string;
  label: string;
  kind: 'select' | 'text' | 'boolean';
  /** Present when `kind` is `'select'` — see `ActuatorTaskParameter`'s `optionsRoute`. */
  optionsRoute?: string;
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
  | { type: 'select'; label: string; optionsRoute: string }
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

export type MediaKind = 'movie' | 'series';

/**
 * The single authority for `MediaSource` role membership: which provider type
 * owns which media kind's catalog. Every other surface derives from this map
 * rather than re-declaring it.
 */
export const SOURCE_OWNER_BY_KIND: Record<MediaKind, MetadataProviderType> = {
  movie: MetadataProviderType.RADARR,
  series: MetadataProviderType.SONARR,
};

const SOURCE_TYPES = new Set<MetadataProviderType>(Object.values(SOURCE_OWNER_BY_KIND));

/** Whether a provider type owns a media catalog (plays the `MediaSource` role). */
export function isMediaSourceType(type: MetadataProviderType): boolean {
  return SOURCE_TYPES.has(type);
}

/** The media kind a catalog-owning provider type owns, if any. */
export function kindOfSourceType(type: MetadataProviderType): MediaKind | undefined {
  return (Object.keys(SOURCE_OWNER_BY_KIND) as MediaKind[]).find(
    (kind) => SOURCE_OWNER_BY_KIND[kind] === type
  );
}
