# Providers module

The providers feature module — the first module converged on the server architecture design
(`docs/architecture/server-architecture.md`): it owns everything for the provider domain, from
HTTP transport down to the system job, and exposes it through one crafted public interface.

## Layout

```
providers/
  index.ts                    # Public interface — the only import surface for code outside the module
  providers.procedures.ts     # API contract procedures: instance CRUD and connection test, actuator
                              #   tasks, task options, ad-hoc metadata
  connectionProbe.ts          # Tests the address and key the owner entered, through the connection
  connections/                # BaseProviderConnection + one class per external system, each
                              #   carrying its catalogue entry and implementing its role interfaces
  roles.ts                    # Capability vocabulary: declared capabilities, role interfaces
                              #   (MediaSource, MovieSource, SeriesSource, PlexLinks, JellyfinLinks,
                              #   TitleLookup, MediaActuator)
  providerClasses.ts          # The one map from provider type to connection class, compile-checked
  providerCatalogue.ts        # Everything derived from the declarations: setup type list, labels,
                              #   source owners, addressing columns
  providerFactory.ts          # Constructs connections from the class map; one query per role
  providerSettingsService.ts  # Persistence + projection of configured providers
  taskEnablement.ts           # Per-instance enabledTasks authority (readEnabledTaskIds)
  plexService.ts              # Validates a Plex auth token against plex.tv (used by auth login)
  tmdbService.ts              # TMDB lookups backed by MediaCache
  catalogRefreshJob.ts        # System job reading the providers' library data into the copy
  catalogRefreshJobFactory.ts # Builds the catalog refresh from configured providers
  providerRefresh.ts          # Refresh records: when each kind of a provider's data last refreshed
  providerLists.ts            # Each provider's stored setup lists (tags, profiles, root folders)
  providerListsReader.ts      # Type-only port the library cache implements for task choices
```

## Public interface

Code outside the module imports only from `@server/modules/providers`. The export list in `index.ts`
is a designed contract chosen export by export — never a wholesale re-export — and anything not
exported is module-private. Module-owned tests (`server/__tests__/modules/providers/`) may reach
internals directly; nothing else should.

## Connections

Each external system (Radarr, Sonarr, Tautulli, Jellyfin, Plex, Seerr, TMDB, OMDB,
TVmaze) gets one class in `connections/` extending `BaseProviderConnection`, which supplies a
pre-configured [`ky`](https://github.com/sindresorhus/ky) client (`prefixUrl` is the stored URL: the
address the owner entered, any web-proxy path and URL base included, plus the type's API path), a
10-second timeout, JSON `Accept` header, and error logging hooks. Connection config (URL, API key,
settings) lives in the `metadata_providers` table. Every connection implements `testConnection()`: one
cheap call that needs the key, through its own client and authentication; the connection test
(`connectionProbe.ts`) runs it on a connection the factory builds, with a silent logger.

### How a provider declares itself

Each connection class carries `static readonly catalogueEntry = { … } as const satisfies
ProviderTypeEntry`: its label, API path, host placeholder or default URL, key requirement and
`capabilities` (`source`, `mediaServer`, `addressedBy`, `providerKind`, `facts`). It implements the
role interfaces its capabilities require (`MovieSource`/`SeriesSource` for `source`,
`PlexLinks`/`JellyfinLinks` for `mediaServer`, `FactReporter` for `facts`) — the class map built
through `defineProviderClasses` refuses to compile otherwise, and refuses a fact reporter that resolves
to no kind or no title id column — and `MediaActuator` when it runs tasks. Callers ask for a capability (`SOURCE_OWNER`, the addressing
columns, the factory's role queries), never for a provider type, and never cast.

Adding a provider that is a source, an actuator addressed by an existing column, or a fact reporter is
its type identity (the `MetadataProviderType` member and the contract's provider-type value), its
connection class (with `catalogueEntry` and the role interfaces it implements) and its entry in the
class map (`providerClasses.ts`). Each content type has exactly one source type today (north-star
belief 9), checked by a unit test over the class map. A new media server still needs more than this: a
role query, a link interface, a link slot in the catalog refresh and a database column, a departure
recorded in the fracture ledger.

A fact reporter declares the reported facts it reports (`facts.reports`, keys of `ReportedFacts` in
`facts.ts`) and translates its own payload into them in `readReportedFacts`; Enrichment, in media,
matches the answers to titles and stores only the declared facts. The precedence between reporters
(`REPORTED_FACT_PRECEDENCE`) ranks kinds of provider, never provider types. See
`docs/architecture/provider-roles-and-identity.md` for the role model.

### Auth patterns

| Provider | Auth method |
|---|---|
| Radarr, Sonarr, Tautulli | `?apikey=` query param |
| Jellyfin | `X-Emby-Authorization` header |
| Seerr (and Overseerr servers) | `X-Api-Key` header |
| Plex (metadata) | `X-Plex-Token` header |

### The Plex split

Plex appears twice on purpose:

- **`plexService.ts`** (`PlexService`) — validates a Plex auth token against `plex.tv`; used by
  `AuthService` during login.
- **`connections/plexProvider.ts`** (`PlexProvider`) — fetches libraries and media items from a
  locally configured Plex Media Server, like every other connection.

## Testing

Module tests live in `server/__tests__/modules/providers/`. MSW intercepts outbound `ky`/fetch calls
via `tests/setup/vitest.server.ts`, so URL construction, headers, and response parsing are exercised
against a real HTTP shape. Handlers are declared in `tests/mocks/handlers/`.
