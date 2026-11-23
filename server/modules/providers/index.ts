/**
 * Public interface of the providers module.
 *
 * Everything the HTTP layer and other modules may consume from the providers
 * domain is exported here, chosen export by export — this is a designed
 * contract, not a barrel. Anything not exported is module-private, and a
 * growing export list is a design smell to challenge.
 *
 * Each provider type declares what it can do on its connection class
 * (`catalogueEntry` and the role interfaces it implements); callers ask for a
 * capability, never a provider type.
 */

// HTTP surface — this module's procedures of the API contract.
export { createProvidersProcedures } from './providers.procedures';

// Container contribution — the app builder composes Cradle from this slice
// and calls the registration; classes registered here stay module-private
// unless consumers construct them directly.
export { registerProvidersDependencies } from './providers.registrations';
export type { ProvidersCradle } from './providers.registrations';

// The facts non-source providers report about titles, by key.
export { REPORTED_FACT_PRECEDENCE } from './facts';
export type { ProviderKind, ReportedFactKey, ReportedFacts } from './facts';

// Provider roles — the capability vocabulary connections implement.
export type {
  ActuatorTask,
  ActuatorTaskDescriptor,
  AddressColumn,
  FactReporter,
  MediaActuator,
  TitleIdColumn,
} from './roles';
export { isMediaActuator } from './roles';

// Factories: connections from stored settings, sources from connections. The container
// constructs the factory; consumers receive it and type it from here.
export type { FactReporterInstance, IProviderFactory, ProviderFactory } from './providerFactory';

// Provider settings — persistence and projection of configured providers.
export { ProviderSettingsService } from './providerSettingsService';
export type { ProviderSettingsDraft, ProviderSummary } from './providerSettingsService';

// What each provider type declares, read from its connection class: how it is named in anything
// shown to the user, which type owns each content type's catalog, and how titles are addressed.
export {
  ADDRESS_COLUMN_BY_TYPE,
  SOURCE_OWNER,
  contentTypeOfSourceType,
  isMediaServerType,
  isMediaSourceType,
  mediaServerOfColumn,
  providerKindOf,
  providerTypeLabel,
  reportersOf,
  reportsFacts,
  titleIdColumnOf,
} from './providerCatalogue';

// Per-provider task enablement read by automations.
export { readEnabledTaskIds } from './taskEnablement';

// Standalone provider-backed services, resolved via the cradle.
export type { PlexService } from './plexService';
export type { TmdbService } from './tmdbService';

// The catalog refresh — the system job that reads the providers' library data into the copy.
export type { CatalogRefreshJobFactory } from './catalogRefreshJobFactory';
// The library copy's refresh records: when each kind of each provider's data was last refreshed.
export {
  failureMessage,
  readRefreshRecords,
  recordRefreshFailed,
  recordRefreshed,
} from './providerRefresh';
export type { RefreshKind, StoredRefreshRecord } from './providerRefresh';
// Each provider's stored setup lists, part of the library copy.
export { readProviderLists } from './providerLists';
export type { ProviderListsData } from './providerLists';
export type { ProviderListsReader } from './providerListsReader';

// Connection classes and the payload types callers read. Search (#238) imports
// the classes directly; every other caller asks for a capability through the role interfaces and the factory's role
// queries. Payload types that only the connections use (profiles, tags) are
// module-private.
export { JellyfinProvider } from './connections/jellyfinProvider';
export type {
  JellyfinItem,
  JellyfinLibrary,
  JellyfinMediaSource,
  JellyfinMediaStream,
  JellyfinUserData,
} from './connections/jellyfinProvider';
export { SeerrProvider } from './connections/seerrProvider';
export type { SeerrIssue, SeerrRequest } from './connections/seerrProvider';
export { PlexProvider } from './connections/plexProvider';
export type { PlexMedia, PlexMediaItem, PlexMediaPart } from './connections/plexProvider';
export { RadarrProvider } from './connections/radarrProvider';
export type { RadarrMovie } from './connections/radarrProvider';
export { SonarrProvider } from './connections/sonarrProvider';
export type { SonarrSeries } from './connections/sonarrProvider';
export { TautulliProvider } from './connections/tautulliProvider';
export type { TautulliHistoryItem } from './connections/tautulliProvider';
export { TmdbProvider } from './connections/tmdbProvider';
