# Fracture ledger — two-designs-for-one-process, tracked to code

A living ledger, not a plan. Extended as each fracture heals or a new
one is found; entries move from Open to Healed, never deleted. Companion to
[`docs/architecture/VOCABULARY.md`](ref:path:docs/architecture/VOCABULARY.md)
(the settled *names* for concepts once healed), and to whatever `docs/in_progress/` plan is currently
healing an Open entry, when one exists. This doc answers a narrower question than either: **for a named
fracture, what surfaces actually exist in code right now** — verified directly against source, not
against what a plan document claims.

## Why this exists

A "fracture" here is Warden's recurring failure mode: one real-world process (task execution, rule
matching) grows a second, renamed vocabulary at a boundary, so two designs answer one question and can
disagree. Healing one replaces the second vocabulary with a derivation from the first authority; it never
adds a translator between them (a translator *is* the fracture, persisted).

Plan documents drift from what Stage N actually shipped, and `docs/in_progress/` is deliberately excluded
from the graph (it's a plan, not fact) — so nothing forced a documented cross-check against the live tree
before more code landed. Concretely: `server/modules/filterFields/filterFields.handler.ts` (Phase 2c, real,
tested, mounted, unconsumed) sat undocumented in `docs/architecture/` and was absent from the Phase 4 plan's
own "live places" inventory, so an agent working Stage 1 fresh could easily have stood up a second
descriptors endpoint beside it — reproducing the fracture while believing it was closing one. This ledger
exists so that question — *does a surface already exist for this vocabulary?* — has one place to check that
is graphed, dated, and verified against code, not inferred from a plan.

## Healed

### Actuator tasks (Phase 3)

- **Fracture:** a type-keyed `taskManifest` table (Phase 2) duplicated what `MediaActuator.tasks()` should
  own — the client held its own ~30-task catalogue, detached from what any instance could actually run.
- **Healed by:** the role owns its tasks — `ActuatorTask` / `ActuatorTaskDescriptor`, instance-keyed
  discovery at `providers.handler.ts` (`GET /api/providers/tasks`), per-instance enablement via
  `taskEnablement.ts`. The client derives via `useProviderTasks` and holds no catalogue; the old
  catalogue (`src/lib/tasks.ts`) is deleted and the `tasks` surface removed from `provider-registry.ts`.
- **Full spec (at time of healing):** `docs/architecture/actuator-task-ownership.md`.

### Filter/rule vocabulary (Phase 4 — shipped 2026-07-06)

- **Fracture:** the client independently re-declared the server's rule catalogue — a static `FILTER_FIELDS`
  object (`src/hooks/useMediaFilters.ts`) duplicating each `MEDIA_RULES` entry's renamed key, `dataType`,
  and content-type scope — plus two client-side translators (`KEY_RENAMES` in `useMediaQueries.ts`, the
  server's own `MOVIE_PARAM_TO_KEY`/`SERIES_PARAM_TO_KEY` in `media.handler.ts`) bridging the renamed
  vocabulary back to registry keys at two different boundaries (save, browse).
- **Healed by:** the registry is the single authority, projected once, consumed generically.
  `MEDIA_RULES`/`MediaRule`/`getRule()` in `filterRegistry.ts` own the predicate contract; every
  `*Gte`/`*Lte` bound pair collapsed into one `dataType: 'range'` rule (`{ min?, max? }`), so "one rule =
  one control = one value shape" holds structurally. `GET /api/filter-fields`
  (`media.filterFields.handler.ts`) projects the provider-gated `MediaRuleDescriptor[]` the client reads
  via `useMediaRules` (SWR). `useMediaFilters` (`useMediaFilters.ts`) derives `FilterState = { shared,
  movie, show, movieSort, seriesSort }` from that registry instead of the deleted `FILTER_FIELDS` —
  scoped by content type (not one flat map) because `MEDIA_RULES` intentionally reuses the same key
  (`tagIds`, `qualityProfileIds`, `genres`) across its movie- and show-scoped entries; a flat map holding
  both simultaneously would silently collide on save. `useMediaQueries.save()` persists those registry
  keys directly — `KEY_RENAMES` and the old `toFilterValues()` are deleted. `MediaFilterBar`
  (`index.tsx`) renders **data-driven** from `MediaRuleDescriptor[]`: control type per `dataType`,
  section grouping derived from `contentTypes`/`sourceProviders` (`groupsFor`), collapsing its ~33
  explicit `setX` props to `values` + a single
  `onRuleChange(scope, key, value)`. `MediaContent`/`MediaPage` (`src/pages/media/index.tsx`) updated to
  match.
- **One surface stays a translator, deliberately:** `MOVIE_PARAM_TO_KEY`/`SERIES_PARAM_TO_KEY` +
  `toFilterValues()` in `media.handler.ts` still bridge the browse path's renamed URL params to registry
  keys — its deletion needs the client to emit registry keys for browsing too, which wasn't in this
  phase's scope. `src/pages/media/mediaQueryAdapters.ts`'s `toBrowseParams()` mirrors it client-side
  (`GET /api/media/movies|series` still expects the old param names) until that translator is retired;
  `toSaveValues()` in the same file is the permanent save-path adapter, not a shim.
- **Deliberate behavior refinement, not a preserved bug:** `hasFile` is declared shared
  (`contentTypes: ['movie', 'series']`) in the registry, but the old hand-built `MediaFilterBar` only ever
  rendered it in the Movies section — series were never filterable by file presence via UI despite the
  registry always allowing it. The generic renderer now offers it in both sections when both providers are
  configured, since nothing about the field is actually movie-specific.
- Migrations `0007_query_model_rewrite.sql` (historical rename rewrite) and
  `0013_media_rule_range_collapse.sql` (historical range-collapse rewrite) are left as-is — not live
  duplication.
- **Spec (at time of healing):** the `MediaRule` / `MediaRuleDescriptor` entry in
  `docs/architecture/VOCABULARY.md` (mirroring `ActuatorTask`/`ActuatorTaskDescriptor` for Phase 3).

### MediaSource ownership vocabulary (spotted 2026-07-06 — healed 2026-07-07, North Star Phase 1)

- **Fracture:** the server has a single authority for "which provider type owns this content type" —
  `OWNER_TYPE` in `mediaSourceFactory.ts` (`{ movie: RADARR, show: SONARR }`) — but the client never read
  it: `MediaPage`'s empty-state gating spelled `configuredTypes.has('RADARR'|'SONARR')` literally,
  agreeing with the authority by coincidence, not by construction.
- **Healed by:** the authority is projected once and derived generically. `sourceOwnership()` (beside
  `OWNER_TYPE` itself) maps each `ContentType` to `MediaSourceDescriptor { contentType, ownerType,
  configured }`, joining active instances via `ProviderSettingsService.activeTypes()` (extracted — the
  same join `media.filterFields.handler.ts` already did). `GET /api/media/sources` (`media.handler.ts`)
  serves it; the client reads it via `useMediaSources` (SWR), and `MediaPage`
  (`src/pages/media/index.tsx`) derives both the empty-state gating **and its copy** (provider name via
  `PROVIDER_REGISTRY[ownerType].label`) from the projection — the literal checks and the
  `providersLoaded` gate are deleted. A change to `OWNER_TYPE` now flows to the client by construction.
- **Adjacent, deliberately untouched:** `MediaFilterBar`'s `groupsFor` (`index.tsx`) still spells
  `'RADARR'`/`'SONARR'` when grouping shared rules — but it reads them off each rule's own
  server-provided `sourceProviders`, a naming-convention dependency rather than a duplicated authority.
  Worth the next person's awareness, not necessarily a fix.

### Server layering — three designs for "where does feature logic live" (recorded 2026-07-07 — healed 2026-07-10, North Star Phase 8)

- **Fracture:** not a vocabulary split but the same shape one level up — multiple designs answered the
  structural question "which layer owns this code," so every new feature re-litigated it. The surfaces,
  verified against the tree as each phase shipped:
  - **Doc fiction as a third design (pruned 2026-07-07):** the server READMEs and the deleted
    `docs/agent/architecture.md` described a boilerplate "clean architecture" on TypeORM —
    `DataSource`, entities, repositories — while the code was Drizzle (`server/database/index.ts`:
    `DrizzleDb`, `getDb()`). Agents reading those docs built against an ORM that wasn't installed.
- **Healed by — infrastructure has one home (North Star Phase 2, 2026-07-08):** `server/kernel/` became
  the sole home for everything infrastructural with no domain meaning: `config`, `env`, `errors`,
  `logger`, `eventBus`, `defineRoute`, `middleware/`, and `db.ts` — the database-handle surface
  re-exporting the `DrizzleDb` contract from `server/database/`, which stayed the schema + migrations
  home. Zero imports from the old locations remained (`server/config.ts`, `server/errors.ts`,
  `server/logger.ts`, `server/env.ts`, `server/middleware/`, `server/services/eventBus.ts`,
  `server/utils/defineRoute.ts` are gone); the direction rule held — kernel imports no service or
  module. `server/container.ts` — the app's assembly layer — was rebuilt on `server/kernel/container.ts`'s
  `createKernelContainer()` mechanism rather than duplicating config/db/eventBus registration itself
  (closed 2026-07-09).
- **Healed by — providers is the first full feature module (North Star Phase 3, 2026-07-08):**
  `server/modules/providers/` took on the provider domain end to end beside the transport files it
  already had: the connections (`connections/` — the base plus one class per external system), `roles.ts`,
  `mediaSource.ts` (relocated again in Phase 8, see below), `mediaSourceFactory.ts`, `providerFactory.ts`,
  `taskEnablement.ts`, the provider settings service, `plexService`, `tmdbService`, `keyResolver`, and the
  identity-resolution job + factory. Everything outside the module imported only the crafted public
  interface (`index.ts`); zero old-path imports remained.
- **Healed by — media is the second full feature module (North Star Phase 4, 2026-07-09):**
  `server/modules/media/` took on normalize, the domain shapes, the rule registry, the query engine, and
  enrichment: `movie.ts`/`series.ts`, `mediaItem.ts`, `normalizeMedia.ts`, `filterRegistry.ts`,
  `mediaQueryEngine.ts`, `enrichmentMerge.ts`, `enrichmentJob.ts` + `enrichmentJobFactory.ts`, and absorbed
  the three route-drawn `filterFields`/`backdrops`/`search` modules as `media.filterFields.*`/
  `media.backdrops.*`/`media.search.*` beside the pre-existing `media.handler.ts`. `server/domain/`,
  `server/utils/filterRegistry.ts`, `server/utils/ratingsAggregation.ts`, `server/providers/normalizeMedia.ts`,
  and `server/jobs/` were deleted. `index.ts` became the crafted public interface.

  A code-review gap closed 2026-07-09: `ratingsAggregation.ts` was flagged as misplaced — it aggregates
  ratings from `TmdbProvider`/`OmdbProvider`/`TvMazeProvider` DTOs and has no dependency on any media
  type, so it moved to `server/modules/providers/ratingsAggregation.ts`, module-private there.

  **Correction (dated addendum, 2026-07-10):** this paragraph originally recorded, as current fact, that
  the enrichment mechanics needing only providers' own vocabulary moved to
  `server/modules/providers/enrichment/`, and that `MediaSource`/`MediaEnricher` stayed in
  `providers/mediaSource.ts` and `providers/roles.ts` as a deliberate, narrow `providers → media`
  exception. Both were true when Phase 4 shipped (2026-07-09) and false the next day: commit `d944ea7`
  relocated both role contracts and their enrichment mechanics into `modules/media/`, eliminating the
  exception. See the dedicated entry below, "North Star exception vs. shipped code," for the full
  account of how that was caught and corrected.
- **Healed by — mediaQueries is the third full feature module (North Star Phase 5, 2026-07-09):**
  `server/modules/mediaQueries/` took on the construction of filters over enriched source data:
  `mediaQueryService.ts` (`MediaQueryRecord` CRUD, filter-value persistence, query health), beside the
  transport files it already had. `index.ts` became the crafted public interface — `MediaQueryService`,
  `MediaQueryRecord`, `MediaQueryValue`, the health types, `createMediaQueryRoutes`; `server/services/`
  no longer had a `mediaQueryService.ts`. Added `mediaQueries.registrations.ts`.

  This surfaced a pre-existing, un-flagged direction violation: `media/mediaQueryEngine.ts` imported
  `FilterValueEntry` from `services/mediaQueryService.ts` — `media → mediaQueries`, backwards from the
  declared `mediaQueries → media` direction, invisible before mediaQueryService had a module boundary to
  cross. `FilterValueEntry` moved to `filterRegistry.ts` beside `FilterValue` and joined media's crafted
  interface.
- **Healed by — automations is the fourth full feature module (North Star Phase 6, 2026-07-09):**
  `server/modules/automations/` took on `automationService.ts`, `automationExecutor.ts`,
  `automationRunService.ts`, and `automationScheduler.ts` (formerly `server/cron/`, now dissolved),
  beside the transport files it already had. `index.ts` became the crafted public interface. Verified the
  dependency direction held: automations imported only the `media`, `mediaQueries`, `providers`
  interfaces and kernel, never query internals.

  `combinationEvaluator.ts` was planned to move to `modules/automations/` too, but its only consumer was
  `media/mediaQueryEngine.ts` — moving it would have created a real `media → automations`
  reverse-direction violation the moment it crossed a module boundary, mirroring the
  `ratingsAggregation.ts` (Phase 4) and `FilterValueEntry` (Phase 5) corrections. It moved to
  `server/modules/media/combinationEvaluator.ts` instead, module-private there.
- **Healed by — auth and system are the fifth and sixth full feature modules (North Star Phase 7,
  2026-07-09):** `server/modules/auth/` took on `authService.ts` and `drizzleStore.ts` (the session
  store; schema/migrations stayed in `server/database/`), beside its transport files.
  `server/modules/system/` resolved the "one name, two homes" collision — HTTP liveness
  (`server/modules/health/`) and system self-healing (`server/health/`: `ensureSystemJobs`,
  `failedStateMiddleware`, `systemHealthCheck`) merged with `systemTaskRunner.ts` under one module and one
  name. Both added a `<module>.registrations.ts`; `server/container.ts`'s inline registration block
  became empty — every `Cradle` entry came from `KernelCradle` or a module's `<Module>Cradle`.
  `server/services/`, `server/health/`, `server/domain/`, `server/utils/`, `server/jobs/`, and
  `server/cron/` were all deleted. `server/modules/settings/` got a minimal `index.ts` too, for
  consistency — it has no domain logic of its own, only `providerSettingsService` from providers.
- **Healed by — enforcement and closure (North Star Phase 8, 2026-07-10):** the eight-module surface
  converged on by Phases 2–7 — `kernel`, `providers`, `media`, `mediaQueries`, `automations`, `auth`,
  `system`, `settings` — is now mechanically enforced, not just documented. A repo-root
  `.dependency-cruiser.cjs` config, run in CI via `yarn depcruise:ci` alongside `lint:ci`/`typecheck`/
  `test:run`, fails on any cross-module import that bypasses a module's `index.ts` or crosses in a
  direction the design doesn't declare. This is what keeps the fracture from reopening: the next
  boundary-crossing import fails at PR time instead of surviving to the next manual review, which is how
  Phases 4, 5, and 6 each found their own direction violations. Full design:
  `docs/architecture/server-architecture-north-star.md`.

### North Star exception vs. shipped code — `providers → media` exception eliminated, doc didn't follow (recorded and healed 2026-07-10)

- **Fracture:** the North Star declared one narrow, deliberate exception to its default
  `media → providers` direction — providers' `MediaSource`/`MediaEnricher` role contracts referenced
  media's `MediaItem` type directly, because a role contract has to name the shape it operates on.
  Commit `d944ea7` ("Provider/media boundary: media owns MediaSource/MediaEnricher, providers stop
  importing media") relocated both role contracts into `modules/media/` and inverted their adapters to
  import provider connection classes instead, eliminating the exception entirely — the direction became
  plain `media → providers` with nothing left to except. The North Star doc
  (`docs/intent/server-architecture-north-star.md` at the time), `VOCABULARY.md`'s `MediaSource`/
  `MediaEnricher`/`MediaItem` rows, `docs/architecture/media-enricher-role.md`'s code snippet and file
  references, and this very ledger's Phase 4 "Healed by" paragraph above all kept describing the old
  exception and the old file locations as current fact after the code had already changed underneath
  them, until Phase 8 caught and corrected all four.
- **How it misled:** this is the same "doc infected by drift" failure mode this ledger's own "Why this
  exists" section names (the `SavedMediaQuery` vocabulary table going stale) — except this instance was
  inside the ledger itself, in the entry whose stated job is "what surfaces actually exist in code right
  now — verified directly against source." Anyone, human or a `graphify query`, trusting the Phase 4
  paragraph or any of the three docs above got a wrong file path and a design principle that no longer
  held.
- **Healed by:** `docs/architecture/server-architecture-north-star.md` (promoted from `docs/intent/` in
  the same phase) now describes the shipped, exception-free state: `MediaSource`/`MediaEnricher` are
  media-owned role contracts (`modules/media/mediaSource.ts`, `modules/media/enrichment/enricher.ts`);
  provider connection classes implement nothing directly, they are bound to these roles by media-owned
  adapters (`sourceAdapters.ts`, `enrichment/enricherAdapters.ts`) that import the provider connection
  classes from providers' public interface. `VOCABULARY.md` and `media-enricher-role.md` were corrected
  to the same real locations and direction in the same phase, and the Phase 4 paragraph above carries a
  dated addendum pointing here rather than being silently rewritten with no trace that it once said
  something else. The dependency-cruiser check added in this phase (see the "Server layering" entry
  above) now makes a reverse `providers → media` edge, sanctioned or not, fail CI — the doc and the code
  can no longer drift apart silently the way they did here.

### MediaQuery naming residue — the `SavedMediaQuery` second vocabulary (recorded 2026-07-07 — healed 2026-07-09, North Star Phase 0)

- **Fracture:** one concept, two names at the HTTP/client boundary. The settled vocabulary (see
  `VOCABULARY.md`) is `MediaQuery` / `MediaQueryRecord` — "saved" is a state of a database entity, not a
  name — and the server already spoke it: `MediaQueryService` (cradle key `mediaQueryService`),
  `MediaQueryRecord`, tables `media_queries` / `media_query_filter_values`, canonical route
  `/api/media-queries`. The old vocabulary survived as a live translator at the HTTP boundary:
  `server/modules/index.ts` mounted `/api/saved-queries` as a back-compat alias, and the client still
  called it — `useMediaQueries` (`KEY`), `QuerySourceList` (preview URLs, plus a `savedQueries` prop fed
  from `AutomationBuilder`).
- **How it misled:** this doc set itself was infected — the class-level rename shipped 2026-06-24
  (`SavedMediaQueryService` → `MediaQueryService`, `SavedMediaQueryRecord` → `MediaQueryRecord`,
  `useSavedQueries` → `useMediaQueries`), but the core model's Ubiquitous Language table kept recording
  the *deprecated* names as canonical, sending anyone who trusted the table hunting for classes that no
  longer existed (fixed 2026-07-07 when the vocabulary moved to `VOCABULARY.md`).
- **Healed by:** deleting the second vocabulary rather than translating it. The client speaks only the
  canonical route: `useMediaQueries.ts` (`KEY = '/api/media-queries'`), `QuerySourceList` (preview URLs
  via a single `previewUrl()`, prop renamed to `queries`, fed from `AutomationBuilder`). The
  `/api/saved-queries` alias mount is deleted from `server/modules/index.ts`;
  `mediaQueryRoutes.integration.test.ts` pins the canonical path. Test vocabulary followed (MSW
  `mediaQueriesHandlers`, integration mounts, contract-test labels).

### Client/server bridge — the API declared three times (recorded and healed 2026-10-03, MVP slice C0)

- **Fracture:** one process (calling the API) had three hand-kept descriptions that could disagree. The
  server declared routes with `defineRoute` in per-module `*.routes.ts`/`*.handler.ts` pairs, fewer than
  half with a response schema, and imported the shared schemas from the client's `src/lib/api/schemas.ts`.
  The client hand-wrote every `/api/...` URL in a dozen local SWR fetchers, each casting `json.data` to the
  type it hoped for, while `/api/filter-fields` answered without the envelope every other route used. MSW
  mocks were a third copy. Nothing failed when one side changed alone: a route added to the server only, a
  client call to a route that didn't exist, or a mock that drifted all compiled and passed.
- **How it misled:** the drift was real, not hypothetical. The shared media-query preview mock lacked the
  `instances` field the route returned, the browse mocks lacked `sourceCount`/`errors`, a hook test's
  saved-query fixture carried `health: 'ok'` where the server returns an object, and the client reached
  into server files (`browseRangeKeys.ts`, `ratingsAggregation.ts`) for types.
- **Healed by:** one oRPC contract in a top-level `contract/` folder that both sides derive from. The
  server implements it (a missing handler or wrong output doesn't compile), the client calls it through a
  contract-typed client and one `useApi` SWR hook (an unknown call or wrong input doesn't compile, and
  responses are validated against the declared output), and mocks are declared from it. Every Express
  router, `defineRoute`, `isAuthenticated()`, `src/lib/api/schemas.ts` and the client's URLs and fetchers
  are gone. Authentication is one default-deny middleware at the implementer root, with public procedures
  marked on the contract. A dependency-cruiser rule forbids `src/` and `server/` importing each other, and
  a test fails the build when a procedure has no client caller outside an explicit allowlist.

### Product and concept names — Maintainarr, Saved queries, Tasks, Activity (recorded and healed 2026-10-03, MVP slice B5)

- **Fracture:** the glossary's one-name-per-concept rule was broken at the user-facing edge. The live
  Automations page said "Saved queries" (a name `VOCABULARY.md` had retired); the System page called system
  automations "Tasks" although Task means a provider action everywhere else, and stories added "New Task",
  "Active Tasks" and "Collections" for automations and queries; the run history page was "Activity" while
  the verb is Run Now and the API is `/automations/runs`. The product itself carried a second name:
  Maintainarr survived in the log filenames, the Plex OAuth product and device name, the default `DB_PATH`
  (while the Dockerfile and config said `warden.db`), user fixtures, `.env.example`, `config/README.md` and
  the README links.
- **How it misled:** a reader following the Dockerfile looked for `warden.db` and found
  `maintainarr.db`, and the same query appeared under two names in one page's source.
- **Healed by:** renaming at the surface rather than translating. UI copy and stories use Query,
  System automations, Runs (`/runs`, `src/pages/runs`) and providers; the default database is
  `./config/db/warden.db`, logs are `warden-*.log`, Plex lists the app as Warden (so an existing instance
  shows as a new device on plex.tv while existing sessions keep working). The plan's Glossary lives in
  `VOCABULARY.md`, with its retired names. A server running with the old default starts with a new
  database unless `DB_PATH` points at its existing file.

### Automation verbs and status — stated three ways (recorded and healed 2026-10-03, MVP slice B1)

- **Fracture:** one concept (switching an automation off) had three descriptions. `VOCABULARY.md` said
  Run Now / Disable / Archive and never Play/Pause, the code stored status `paused` and drew Pause/Play
  icons, and `system-vs-user-automations.md` said Pause/Resume/Delete. The status union
  `'active' | 'paused'` was also typed separately in the contract, the read model, the service, the hook,
  the mock handler and the page.
- **How it misled:** a reader of the glossary looked for Disable and found Pause in every layer; a type
  edit in one place compiled while another still accepted the old value.
- **Healed by:** one `AutomationStatusSchema` (`active` or `disabled`) in `contract/schemas.ts`, consumed
  by the read model, the `updateStatus` input, the service, the hook, StatusDot and the dashboard
  summary. Rows offer Disable or Enable with power icons, and migration 0025 rewrites stored `paused`
  values to `disabled`. Archive remains unbuilt.

### Movie or series — three spellings (recorded and healed 2026-10-03, MVP slice B2)

- **Fracture:** one concept had three TypeScript names and two stored values. `ContentType` (the contract
  and the registry alias), `MediaKind` (provider roles, identity resolution) and an inline
  `z.enum(['movie', 'show'])` all described it, the stored and filtered value was `show` while the routes,
  `series*` fields and UI copy said series, and the model was `NormalizedShow` in `show.ts`.
- **How it misled:** a reader could not tell whether `show` and `series` were two concepts, and a type
  edit in one declaration compiled while another still accepted the old value.
- **Healed by:** one `ContentTypeSchema` / `ContentType` (`movie | series`) in `contract/schemas.ts`, imported
  by the registry, the query engine, provider roles and the client. `MediaKind`, the registry alias and the
  client's duplicate declaration are deleted. `NormalizedShow` is `NormalizedSeries` in `series.ts`,
  `SOURCE_OWNER_BY_KIND` is `SOURCE_OWNER`, and migration 0026 rewrites stored `show` queries and
  identities to `series` and rebuilds the tvdbId unique index under the new kind. Plex and Tautulli keep
  their own `show` as an external spelling translated at the boundary.

### Providers and settings — three HTTP homes (recorded and healed 2026-10-04, MVP slice B3)

- **Fracture:** one concept (a configured provider) had two HTTP homes and a third, unenforced module
  beside them. Provider CRUD and the connection test lived at `/api/settings/providers` in a
  transport-only `settings` module, while the same provider's tasks, task options, metadata and ratings
  lived at `/api/providers` in the `providers` module, and the contract declared all of them under one
  `providers` namespace anyway. System-wide settings lived in an `appSettings` module that
  `.dependency-cruiser.cjs` never listed, so its imports were checked by no direction rule.
- **How it misled:** a reader looking for "where providers are served" found half the namespace under
  settings, and a module could be added under `server/modules/` without its boundaries being enforced,
  with nothing failing.
- **Healed by:** every `providers` procedure is implemented by one factory in the providers module and
  served under `/api/providers` (CRUD at `/api/providers` and `/api/providers/{id}`, the probe at
  `/api/providers/test`); the `settings` module is deleted and its former paths answer 404. `appSettings`
  joined the direction graph with no allowed cross-module targets, its behaviour and route unchanged, and
  a boundaries test fails when any directory under `server/modules/` has no direction rule.

### Rule, filter, query and source names — two words for each of four concepts (recorded and healed 2026-10-04, MVP slice B6)

Earlier entries in this ledger use the names that were current when they healed (`filterRegistry.ts`,
`/api/filter-fields`, `FilterValueEntry`, `sourceProviders`); the names below replace them.

- **Fracture:** *rule* and *filter* were used for the same thing (`MediaRule` / `MEDIA_RULES` beside
  `filterRegistry.ts`, `/api/filter-fields` and `FilterValueEntry`), and *source* meant four things: the
  `MediaSource` role, an automation's included or excluded query (`MediaQuerySource`, `querySources`,
  table `automation_query_sources`), a query spec's `sources`, and a rule's `sourceProviders`. A saved
  filter also kept its instance qualification outside its value, as a sibling `providerId` field and
  column.
- **How it misled:** a reader could not tell whether a filter was a rule or a value of one, or which of
  four "sources" a name referred to, and an instance-scoped value could be copied without the
  instance its ids belong to.
- **Healed by:** a rule is the engine's definition and lives in `ruleRegistry.ts`, served by the contract's
  `rules` procedure at `/api/rules`; a filter is exactly `Filter { ruleKey, value }`. An instance-scoped
  value (tags, quality and language profiles) is `{ providerId?, ids }`, naming the configured instance
  its ids belong to, and migration 0029 folds the `providerId` column into the stored value.
  An automation has included and excluded `queries` (`AutomationQuery`), stored in `automation_queries`
  (migration 0028 renames the table and keeps its rows). A query spec holds `clauses` and a rule lists
  its `providers`, which leaves "source" meaning only the `MediaSource` role. The retired names are in
  `VOCABULARY.md`'s deprecated table; the old path answers 404 by regression test.

### Rule presentation — declared on the server and again on the client (recorded and healed 2026-10-04, MVP slice C2)

- **Fracture:** a rule's presentation had two authorities. The registry declared its key, label and
  data type, while the filter bar kept its own per-key tables for everything else: boolean value labels,
  enum options, segment labels, which lookup fed a multi-value control, which section a rule sat in
  (derived by reading the rule's providers) and whether a rule had a control at all. The descriptor
  itself was the registry rule minus its predicate, so engine concerns (producing providers, the
  enrichment field a rule reads, `required`) crossed the wire.
- **How it misled:** a rule added to the registry rendered with Yes/No labels, no options, the wrong
  heading or not at all until someone found and extended the matching client table, and nothing failed
  when they didn't. Section headings followed provider names, so Plex/Jellyfin file facts appeared under
  Play History.
- **Healed by:** each rule declares its own `valueLabels`, `options`, `shortLabel`, `lookup` and `group`.
  The descriptor is an allowlist of presentation fields, a union on `dataType` in which every variant
  states what its control needs. `toDescriptor` projects through it, and a rule that cannot be described
  (`certification`, a multi-value rule with no lookup) is not served. The filter bar renders any rule
  from its descriptor alone and holds no per-key table. The `csv-ids` data type is now `instance-ids`.

### Provider catalogue and exposure — declared on the client and decided nowhere (recorded and healed 2026-10-04, MVP slice C5)

- **Fracture:** the provider-type catalogue had four client copies beside the server's real authority.
  `src/lib/provider-registry.ts` listed 8 of the 10 types with hand-written labels, capability text and
  display order. The add-provider form kept its own type list, API-path suffixes and default URLs. The
  provider card kept suffixes and capability text again, and the connection probe kept a fifth suffix
  map on the server. Which types, rules and tasks Warden exposed was decided by none of them: the
  contract's enum accepted every type.
- **How it misled:** the add-provider list offered raw enum names, including TMDB and OMDB, and creating
  a SEERR or TVMAZE provider passed validation and then threw in `ProviderFactory`. Rules claimed by
  TMDB or TVmaze alone (`tmdbStatus`) were served whenever such a row existed, and a new type needed
  matching edits in every copy before it rendered properly.
- **Healed by:** `contract/scope.ts` is the one scope declaration. It lists the deferred provider types
  (SEERR, TMDB, OMDB, TVMAZE), the deferred rules (`certification`, `tmdbStatus`, checked by test to be
  exactly the rules with no control or no offered producer) and the deferred tasks (none). The kernel
  container injects it as `scope`. Provider create and the connection test refuse a deferred type, a
  rule needs a live producer of an offered type, and deferred tasks are left out of
  `/api/providers/tasks`. The server's provider-type catalogue (`providerCatalogue.ts`, keyed by type)
  declares labels, API paths, default URLs and capability text once. The probe and `ProviderFactory`
  read it, and `GET /api/providers/types` projects the offered types. The client derives the
  add-provider list, the provider card's label, path and filter data, the Providers page order and the
  media page's owner name from that projection. Every client copy is deleted.

## Open

No fracture is currently open.
