/**
 * Public interface of the providers module.
 *
 * Everything the HTTP layer and other modules may consume from the providers
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 *
 * The per-system connection classes and their payload types are part of the
 * contract — media owns the `MediaSource`/`MediaEnricher` ports and builds
 * its adapters directly over these connections' native surface.
 */

// HTTP surface — this module's procedures of the API contract.
export { createProvidersProcedures } from './providers.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; classes registered here stay module-private
// unless consumers construct them directly.
export { registerProvidersDependencies } from './providers.registrations';
export type { ProvidersCradle } from './providers.registrations';

// Provider roles — the capability vocabulary connections implement.
export type { ActuatorTask, ActuatorTaskDescriptor, MediaActuator } from './roles';
export {
  SOURCE_OWNER,
  isMediaActuator,
  isMediaSourceType,
  contentTypeOfSourceType,
} from './roles';

// Factories: connections from stored settings, sources from connections.
// ProviderFactory keeps a value export because consumers construct it as an
// injection fallback; the container-only classes are types here.
export { ProviderFactory } from './providerFactory';
export type { IProviderFactory, ProviderInstance } from './providerFactory';

// Provider settings — persistence and projection of configured providers.
export { ProviderSettingsService } from './providerSettingsService';
export type {
  PrecedenceCoverageValidator,
  ProviderSettingsDraft,
  ProviderSummary,
} from './providerSettingsService';

// Per-provider task enablement read by automations.
export { readEnabledTaskIds } from './taskEnablement';

// Standalone provider-backed services, resolved via the cradle.
export type { PlexService } from './plexService';
export type { TmdbService } from './tmdbService';

// Identity resolution — the system job that stitches source identities.
export type { IdentityJobFactory } from './identityJobFactory';

// Connection classes + payload types still consumed outside the module
// (search handler, media handler, enrichment mappers) until Phase 4.
export { JellyfinProvider } from './connections/jellyfinProvider';
export type {
  JellyfinItem,
  JellyfinLibrary,
  JellyfinMediaSource,
  JellyfinMediaStream,
  JellyfinUserData,
} from './connections/jellyfinProvider';
export { OverseerrProvider } from './connections/overseerrProvider';
export type { OverseerrIssue, OverseerrRequest } from './connections/overseerrProvider';
export { PlexProvider } from './connections/plexProvider';
export type { PlexMedia, PlexMediaItem, PlexMediaPart } from './connections/plexProvider';
export { RadarrProvider } from './connections/radarrProvider';
export type { RadarrMovie, RadarrProfile, RadarrTag } from './connections/radarrProvider';
export { SonarrProvider } from './connections/sonarrProvider';
export type { SonarrProfile, SonarrSeries, SonarrTag } from './connections/sonarrProvider';
export { TautulliProvider } from './connections/tautulliProvider';
export type { TautulliHistoryItem } from './connections/tautulliProvider';
export type { OmdbRating } from './connections/omdbProvider';
export { TmdbProvider } from './connections/tmdbProvider';
export type { TmdbRating } from './connections/tmdbProvider';
export type { TvMazeRating } from './connections/tvmazeProvider';
