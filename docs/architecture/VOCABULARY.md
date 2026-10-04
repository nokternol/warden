# Vocabulary — the product's Ubiquitous Language

The canonical name for each crystallized product concept, what it
means, and where it binds in code. **The TypeScript type is the binding source of truth**; this table is
the discoverable index into it. When a concept gets a settled name, record it here and stop writing the
deprecated names in new code. Formerly a section of
[`warden-core-model.md`](ref:path:docs/architecture/warden-core-model.md), which keeps the product loop
and model narrative; this doc owns the names.

Naming principle, learned the hard way (see the MediaQuery entry): **states are not names.** A persisted
query is not a different concept from a query — "saved" is a state of a database entity, so the persisted
shape is the concept's name plus `Record`, never a re-prefixed second vocabulary. Any surface that grows
a renamed second vocabulary for an existing concept is a fracture
([`fracture-ledger.md`](ref:path:docs/architecture/fracture-ledger.md)).

## Providers & roles

| Term | Meaning | Binds in code |
|---|---|---|
| **System / Provider** | A configured external *system* — connection config only, discriminated by [`MetadataProviderType`](ref:path:server/database/schema.ts). Configuring one unlocks capabilities; it does nothing by itself. Invariant: one active provider per type, **except** `MediaSource`-role types (Radarr, Sonarr — see `isMediaSourceType`), which may have any number of active instances. | [`server/database/schema.ts`](ref:path:server/database/schema.ts) |
| **BaseProviderConnection** | The shared HTTP-client + config base every system extends. A *connection* base, not a role or metadata contract. | [`server/modules/providers/connections/baseProviderConnection.ts`](ref:path:server/modules/providers/connections/baseProviderConnection.ts) |
| **MediaSource** | Role: owns a media collection — what *exists* + a canonical per-item id. Advertises `getMediaItems()`/`idOf()`, not `getMovies`/`getSeries`; every source-produced item self-describes its provenance (`_sourceIds.providerId`). Media-owned; provider connections are bound to it by adapters, never implement it directly. | [`server/modules/media/mediaSource.ts`](ref:path:server/modules/media/mediaSource.ts) |
| **MediaEnricher** | Role: contributes metadata about media it does *not* own, joined by a logical key; `enrich(items)` decorates the canonical `MediaItem`, precedence resolved per field at write time. Media-owned; provider connections are bound to it by adapters, never implement it directly. Spec: [`media-enricher-role.md`](ref:path:docs/architecture/media-enricher-role.md). | [`server/modules/media/enrichment/enricher.ts`](ref:path:server/modules/media/enrichment/enricher.ts) |
| **MediaActuator** | Role: exposes actions on addressable media and **owns its tasks** via `tasks(): ActuatorTask[]` — the sole authority for what tasks exist. Provider-owned. Spec: [`actuator-task-ownership.md`](ref:path:docs/architecture/actuator-task-ownership.md). | [`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts) |
| **SOURCE_OWNER** | The single authority for `MediaSource` role membership: which provider type owns which `ContentType` (movie→Radarr, series→Sonarr). Provider-owned; media derives (`sourceOwnership()`), never re-declares. Superseded `OWNER_TYPE` (formerly media-owned) in the multi-instance identity model. | [`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts) |
| **MediaSourceFactory** | `sourcesFor(contentType)` resolves a `ContentType` to one `MediaSource` per *active instance* owning it (never collapsed to one) — used by preview fan-out. | [`server/modules/media/mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts) |
| **MediaSourceDescriptor** | The wire projection of `SOURCE_OWNER`: `{ contentType, ownerType, configured, instances: [{ id, name }] }` per content type, served by `GET /api/media/sources` and read via [`useMediaSources`](ref:path:src/hooks/useMediaSources.ts) — the client derives source-ownership gating and per-instance labeling from this, never from its own provider-type literals. Invariant: `configured === (instances.length > 0)` — a fixture or mock with `configured: true` and an empty `instances` array describes a state the server can never actually produce. | [`server/modules/media/mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts) |

A system plays **up to three independent roles** (Source, Enricher, Actuator), declared per system by
the role interfaces it `implements`, never assumed from the connection base. Source/enricher tiering:
[`provider-roles-and-identity.md`](ref:path:docs/architecture/provider-roles-and-identity.md).

## Media & identity

| Term | Meaning | Binds in code |
|---|---|---|
| **ContentType** | `'movie' \| 'series'` — the axis provider ownership, rules, and query scoping all key on. Declared once, in the API contract; every layer imports it. | [`contract/schemas.ts`](ref:path:contract/schemas.ts) |
| **NormalizedMovie / NormalizedSeries** | The canonical domain shapes predicates run over. Types live in [`server/modules/media/movie.ts`](ref:path:server/modules/media/movie.ts) / [`server/modules/media/series.ts`](ref:path:server/modules/media/series.ts); the per-provider mapping functions live in [`normalizeMedia.ts`](ref:path:server/modules/media/normalizeMedia.ts). | [`server/modules/media/movie.ts`](ref:path:server/modules/media/movie.ts) |
| **MediaItem / MediaItemSet** | `MediaItem = NormalizedMovie \| NormalizedSeries`; a `MediaItemSet` is the transient result of resolving a source. Media-owned (the canonical superset); the `MediaSource`/`MediaEnricher` role contracts are media-owned too, so referencing it is ordinary same-module code, not a cross-module exception. Provider connection classes never reference it directly — media-owned adapters ([`sourceAdapters.ts`](ref:path:server/modules/media/sourceAdapters.ts), [`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) bind providers' native connections to these roles, ordinary `media → providers` direction, no exception. | [`server/modules/media/mediaItem.ts`](ref:path:server/modules/media/mediaItem.ts) |
| **media_identity** | The logical-title **group** — one row per title, no per-source coordinate. Keyed per-`ContentType`; a partial-unique index on its primary id (`tmdbId` for movies, `tvdbId` for series) is the find-or-create key `resolveGroup` reads. Never merged with another existing group. | [`server/database/schema.ts`](ref:path:server/database/schema.ts) |
| **media_item** | One row per **instance's concrete copy** of a title, `UNIQUE(providerId, externalId)` — `providerId` is the configured instance (`metadata_provider.id`), so two instances of the same provider type never collide. `onDelete: 'cascade'` from both `metadata_provider` and `media_identity`. A copy that leaves its source is kept with `deleted` set (a soft delete) so run history still names it; readers that need a live copy ignore deleted rows. | [`server/database/schema.ts`](ref:path:server/database/schema.ts) |
| **Identity resolution** | The per-active-instance job that upserts each fetched item's `media_item` row via `resolveGroup` (find-or-create the `media_identity` group by primary id, else a fallback chain), marks each instance's vanished copies deleted (and clears the mark when an item returns), and sweeps groups left with no copies at all — so enrichers can join media they don't own by a stable group id. | [`server/modules/providers/identityResolutionJob.ts`](ref:path:server/modules/providers/identityResolutionJob.ts) |
| **Enrichment** | The materialized join between "providers configured" and "filters that match something": the [`EnrichmentJob`](ref:path:server/modules/media/enrichmentJob.ts) writes `media_enrichment`; [`enrichmentMerge.ts`](ref:path:server/modules/media/enrichmentMerge.ts) reads it onto normalized items. Both go through the shared [`EnrichmentQueries`](ref:path:server/modules/media/enrichment/enrichment.queries.ts) DAL seam ([the EAV rewrite](ref:path:docs/architecture/media-enrichment-eav-model.md)) rather than referencing each other directly. Per-provider DTO → contributed-field mapping ([`MediaFieldProvider`/`MediaFieldSource`](ref:path:docs/architecture/media-field-provider-role.md)) and the match-and-decorate join ([`decorate.ts`](ref:path:server/modules/media/enrichment/decorate.ts)) are media-owned, typed against the central `EnrichmentFields` dictionary; precedence resolution ([`precedence.ts`](ref:path:server/modules/media/enrichment/precedence.ts)) is media-owned too. | [`server/modules/media/enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts) |

## Rules & queries

| Term | Meaning | Binds in code |
|---|---|---|
| **MediaRule / MediaRuleDescriptor** | The queryable predicate shapes. `MediaRule` pairs a `predicate` with its engine concerns (`providers`, `sourceField`, `required`) and its presentation: `key`, `label`, `contentTypes`, `dataType`, `instanceScoped`, and the optional `valueLabels` (a boolean's two values), `options` (an enum's values), `shortLabel`, `lookup` (the `media` procedure a multi-value rule's options come from) and `group` (its section heading). `MediaRuleDescriptor` is the presentation alone, built by `toDescriptor` through the contract's allowlist schema ([`contract/media.ts`](ref:path:contract/media.ts)), a union on `dataType` in which every valid descriptor has a control; a rule that has none is not served. `MEDIA_RULES` is the single authority, with no client-side rule catalogue or presentation table. Client derives its controls from the `media.rules` procedure (`GET /api/rules`, [`media.rules.procedures.ts`](ref:path:server/modules/media/media.rules.procedures.ts)) via [`useMediaRules`](ref:path:src/hooks/useMediaRules.ts), scoping state by content type because the registry intentionally reuses keys (`tagIds`, `qualityProfileIds`, `genres`) across movie/series. | [`server/modules/media/ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts) |
| **Filter** | A rule's key and a chosen value, `Filter { ruleKey, value }`, as set in the UI and stored by a query. It knows nothing about which provider supplies the data; the rule resolves that. The value of an instance-scoped rule (tags, quality and language profiles) is `{ providerId?, ids }`, naming the configured instance the ids belong to (absent: read in each item's own instance). | [`server/modules/media/ruleRegistry.ts`](ref:path:server/modules/media/ruleRegistry.ts), [`contract/schemas.ts`](ref:path:contract/schemas.ts) |
| **MediaQuerySpec** | The persistable, source-less core of a query: `{ contentType, clauses }`, each `MediaQueryClause` a list of filters with an `include` or `exclude` role. | [`server/modules/media/mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts) |
| **MediaQuery** | A `MediaQuerySpec` bound to a `MediaSource` — the engine's input. | [`server/modules/media/mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts) |
| **MediaQueryRecord** | A `MediaQuerySpec` with database identity + presentation metadata (`id`, `name`, `health`). **"Saved" is a state, not a name** — the deprecated `SavedMediaQuery` vocabulary re-prefixed the concept instead of naming the state; its residue was healed in North Star Phase 0 (see the ledger). | [`server/modules/mediaQueries/mediaQueryService.ts`](ref:path:server/modules/mediaQueries/mediaQueryService.ts) |
| **MediaQueryService** | CRUD + health for `MediaQueryRecord`s (cradle key `mediaQueryService`, tables `media_queries` / `media_query_filter_values`, canonical route `/api/media-queries`). | [`server/modules/mediaQueries/mediaQueryService.ts`](ref:path:server/modules/mediaQueries/mediaQueryService.ts) |
| **Query health** | Per-record status (`healthy`/`degraded`/`unavailable`) derived from whether the providers its filter keys need are configured. | [`server/modules/mediaQueries/mediaQueryService.ts`](ref:path:server/modules/mediaQueries/mediaQueryService.ts) |

## Tasks & automations

| Term | Meaning | Binds in code |
|---|---|---|
| **ActuatorTask / ActuatorTaskDescriptor** | The role's task shapes: a descriptor (`id, label, destructive, affects?`) plus instance-bound `run(ids)`. Declared by `MediaActuator.tasks()` on the configured instance — no type-keyed table anywhere. | [`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts) |
| **Task enablement** | Per-instance `settings.enabledTasks` (default off), read by `readEnabledTaskIds`; enforced at `automationService.create` and executor run. | [`server/modules/providers/taskEnablement.ts`](ref:path:server/modules/providers/taskEnablement.ts) |
| **Automation** | A query bound to a task on a schedule — the product's unit of action. `kind: 'user' \| 'system'`; system automations are invariants (Run-Now-only, cannot be disabled or deleted). Spec: [`system-vs-user-automations.md`](ref:path:docs/architecture/system-vs-user-automations.md). | [`server/modules/automations/automationService.ts`](ref:path:server/modules/automations/automationService.ts) |
| **Included / excluded query** | A query an automation draws its media from (`include`) or removes from it (`exclude`): `AutomationQuery { queryId, role, sortOrder }`, listed as the automation's `queries` and stored in `automation_queries`. | [`contract/schemas.ts`](ref:path:contract/schemas.ts), [`server/database/schema.ts`](ref:path:server/database/schema.ts) |
| **AutomationExecutor** | Runs a task against the ids a query matches; binds the provider by `automation.provider.id`, dispatches via `source.tasks()`. `planRun` decides the task, the target items and their actuator ids before the task runs, so a run records its targets (as run items) whether the task succeeds or fails. Holds the in-flight guard that keeps manual and scheduled runs from overlapping. | [`server/modules/automations/automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts) |
| **SystemTaskRunner** | Dispatch target for `system` automations (identity/enrichment jobs) — internal jobs, deliberately not actuator tasks. | [`server/modules/system/systemTaskRunner.ts`](ref:path:server/modules/system/systemTaskRunner.ts) |
| **Run item** | One source copy (`media_item`) a run targeted, stored in `automation_run_items(runId, mediaItemId)` and titled by join at read time; shown on the Runs page when a run expands, marked removed once the copy is deleted. A user run's `itemCount` is its number of run items. | [`server/modules/automations/automationRunService.ts`](ref:path:server/modules/automations/automationRunService.ts) |
| **Run Now / Disable / Enable / Delete** | The UI verb model for automations — never Play/Pause, which would imply runtime control over an executing process. An automation's status is `active` or `disabled`, declared once as `AutomationStatusSchema`. Archive is a future verb, not built. | [`contract/schemas.ts`](ref:path:contract/schemas.ts) |

## API

| Term | Meaning | Binds in code |
|---|---|---|
| **API contract / procedure** | The one declaration of the HTTP API: each *procedure* (`automations.list`, `media.rules`, …) states its method, path, input and output. The server implements it, the client calls it, mocks are declared from it. | [`contract/index.ts`](ref:path:contract/index.ts), [`server/kernel/api.ts`](ref:path:server/kernel/api.ts), [`src/lib/api/client.ts`](ref:path:src/lib/api/client.ts) |

## Glossary — one name per concept

The names the product settled on, across UI, API, code and docs. A second name for a concept is a
fracture.

| Concept | Canonical name | Retired names | Rationale |
|---|---|---|---|
| A configured external system | **Provider** | service, integration (UI) | PRODUCT.md and the UI already say Provider. `BaseProviderConnection` stays as an internal HTTP class name. |
| A named, persisted set of filters | **MediaQuery**, shown as "Query" | saved query, `SavedQuery`, collection | "Saved" is a state, not a name. |
| Query + task + schedule | **Automation** (user or system) | "Task" for automations (System page, stories) | A system automation is an automation, not a "Task". |
| An action a provider offers | **Task** | — | `ActuatorTask`, unchanged. |
| One execution of an automation | **Run**, page **Runs** | Activity | The page shows runs, the verb is Run Now, and the API is `/automations/runs`. |
| An automation's controls and status | **Run Now / Disable / Enable / Delete**; status `active` or `disabled` | Pause, Resume, Play, status `paused` | Pause and Play imply control over an executing process; a disabled automation simply isn't scheduled. Stored `paused` values migrated to `disabled`. |
| Movie or series | **movie / series** | show, `MediaKind`, `NormalizedShow` | Users see Sonarr's term, and the UI, routes and `series*` fields already say series. Stored `show` values migrated to `series`. |
| What can be filtered on: key, type, predicate, the field it reads, the providers producing that field | **Rule** | `filterRegistry`, `filterFields`, `/api/filter-fields` | `MediaRule` / `MEDIA_RULES` live in `ruleRegistry.ts` and are served by the contract's `rules` procedure at `/api/rules`. A rule is the engine's definition; a filter is a rule's key paired with a value. |
| A rule's key and a chosen value | **Filter** | `FilterValueEntry` | `Filter { ruleKey, value }` knows nothing about which provider supplies the data. `FilterValue` stays the name of the value itself. |
| A query an automation includes or excludes | **Included / excluded query** | query source, `MediaQuerySource`, `querySources`, `automation_query_sources` | `AutomationQuery { queryId, role, sortOrder }`, table `automation_queries`. "Source" is reserved for one meaning (next row). |
| A provider that owns media | **Source** | `sourceProviders` on rules | A rule lists its `providers`; `MediaSource` is the one place "source" is used. |
| The product | **Warden** | Maintainarr | Log files are `warden-*.log`, the default database is `./config/db/warden.db`, and Plex lists the app as Warden. |

## Deprecated names — stop writing these

| Deprecated | Canonical | Residue |
|---|---|---|
| `SavedMediaQuery`, `savedQueries`, `/api/saved-queries` | `MediaQuery` / `MediaQueryRecord`, `/api/media-queries` | Deleted (North Star Phase 0, healed) — the retired alias 404s by regression test. |
| `FILTER_FIELDS` (client rule catalogue) | Derived from `MediaRuleDescriptor[]` via `useMediaRules` | Deleted (Phase 4, healed). |
| `taskManifest` (type-keyed task table) | `MediaActuator.tasks()` on the instance | Deleted (Phase 3, healed). |
| `getMovies` / `getSeries` on sources | `getMediaItems()` on the `MediaSource` role | — |
| `defineRoute`, `*.routes.ts`/`*.handler.ts` | A procedure in the API contract, implemented in `<module>.procedures.ts` | Deleted (C0). |
| Local SWR `fetcher`s, hand-written `/api/...` URLs | `api.<ns>.<procedure>` via `useApi` | Deleted (C0). |
| "Saved query", `SavedQuery`, "collection" (a named set of filters) | Query (`MediaQuery`) | Renamed in UI copy, stories, API errors and docs (B5). |
| "Task" for an automation (System page, stories) | Automation — Task means a provider action | Renamed (B5). |
| Automation status `paused`, Pause / Resume / Play controls | Status `disabled`; Disable / Enable | Migration 0025 rewrites stored values; the literal unions are deleted (B1). |
| Activity (page) | Runs, route `/runs` | Renamed (B5). |
| service, integration (in UI copy) | Provider | Renamed (B5). |
| `show` (content type value), `MediaKind`, `NormalizedShow`, `show.ts`, `SOURCE_OWNER_BY_KIND` | `series`, `ContentType`, `NormalizedSeries`, `series.ts`, `SOURCE_OWNER` | Migration 0026 rewrites stored values; the extra declarations are deleted (B2). Plex's and Tautulli's own `show` stays an external input spelling. |
| `filterRegistry`, `filterFields`, `/api/filter-fields` | `ruleRegistry`, the contract's `rules` procedure, `/api/rules` | Renamed (B6); the old path 404s by regression test. |
| `FilterValueEntry` (with a `key`) | `Filter { ruleKey, value }` | Renamed (B6). A filter's instance qualification (`providerId`) moved from a sibling field and column into the value: migration 0029. |
| `MediaQuerySource`, `MediaQuerySpec.sources` | `MediaQueryClause`, `MediaQuerySpec.clauses` | Renamed (B6). |
| `querySources`, `AutomationQuerySource`, `QuerySourceList`, table `automation_query_sources` | `queries`, `AutomationQuery`, `AutomationQueryList`, table `automation_queries` | Renamed (B6); migration 0028 renames the table and keeps its rows. |
| `sourceProviders` on a rule, `deriveSourceProviders` | `providers`, `deriveProviders` | Renamed (B6). |
| `csv-ids` (rule data type) | `instance-ids`: its value is `{ providerId?, ids }`, not a CSV string | Renamed (C2). |
| `BOOLEAN_VALUE_LABELS`, `ENUM_OPTIONS`, `SEGMENT_LABEL_OVERRIDES`, `groupsFor`, `ruleRendersControl` (client presentation tables) | The rule's own `valueLabels`, `options`, `shortLabel`, `lookup` and `group`, read from its descriptor | Deleted (C2). |
| Maintainarr | Warden | Renamed (B5): log filenames, Plex product and device name, default `DB_PATH`, fixtures, README links. |
