# Provider Roles & the Media Identity Model

As of 2026-11-22, this documents the model the code *actually* implements today, including its
remaining limits — recorded as architecture rather than intent because the hierarchy and the
multi-instance identity model described below are real and load-bearing, not an unstarted plan.

**Scope:** this covers the **MediaSource** role, the group/instance identity model underneath it, and
**facts**: what each provider tells Warden about a title, declared once by that provider. The
**MediaActuator** role (tasks/actions) is the role-owned task model in
`docs/architecture/actuator-task-ownership.md`.

## Why this is recorded as architecture, not intent

Providers were originally conceived as a flat, all-optional set of feeders mapped into one graph. In
practice the code grew an implicit hierarchy: a couple of providers became *catalog owners* and the
rest became *decorators*. That hierarchy is not a mistake or an unstarted plan — it is a real,
load-bearing property of the running system, encoding an original intention (some providers *seed* the
catalog; others *enrich* it) that was discovered by evolution rather than declared up front.

A second load-bearing property, added later: catalog ownership is a **role membership fact**, not a
per-request assumption. Which provider types own which content type is declared in one place and
every other surface derives from it — never re-declares it.

## The three emergent tiers

| Tier | Providers (today) | Role in code |
|---|---|---|
| **Catalog owner** (`MediaSource`) | Radarr (movies), Sonarr (series) | Define what *exists* and its canonical id; the catalog is the union of every active instance's library |
| **Fact reporter** | Plex, Jellyfin, Tautulli, Seerr, TMDB | Report facts about titles they can address, matched by a title id; contribute nothing standalone |
| **Inert toward catalog** | Plex-as-*owner*, Jellyfin-as-*owner* | Cannot produce a catalog row at all |

With no Radarr and no Sonarr configured, the app is effectively empty: browse lists, identity
resolution, and enrichment all short-circuit to nothing (see the pipeline below).

## How a provider type declares what it can do

Each connection class carries a static `catalogueEntry`: how its provider type is presented and
reached (label, API path, host placeholder or default URL, key requirement) and its
`capabilities` ([`ProviderCapabilities`](ref:path:server/modules/providers/roles.ts)):

| Capability | Meaning | Declared by (today) |
|---|---|---|
| `source: ContentType` | Owns that content type's catalog | Radarr `movie`, Sonarr `series` |
| `mediaServer: AddressColumn` | Is the media server titles' `<column>` links point into, and addresses titles by it | Plex `plexRatingKey`, Jellyfin `jellyfinItemId` |
| `addressedBy: AddressColumn` | Addresses titles by a column it is not the media server for | Tautulli `plexRatingKey` |
| `providerKind: ProviderKind` | The kind of fact reporter it is, where `mediaServer` does not already say | Tautulli `watchHistory`, Seerr `requestManager`, TMDB `metadata` |
| `facts: { reports, matchedBy? }` | The reported facts it reports, and the title id its answers are matched by when it has no address column | Plex, Jellyfin, Tautulli; Seerr and TMDB with `matchedBy: 'tmdbId'` |

Running tasks is declared by implementing `MediaActuator` (see the actuator doc). The entry is
`as const`, so the declared values stay visible to the type checker.

[`providerClasses.ts`](ref:path:server/modules/providers/providerClasses.ts) holds the one map from
provider type to connection class, in display order, built through `defineProviderClasses`. Its type
reads each class's declared capabilities and requires the matching role interface
([`roles.ts`](ref:path:server/modules/providers/roles.ts)): `source: 'movie'` a `MovieSource`,
`source: 'series'` a `SeriesSource`, `mediaServer: 'plexRatingKey'` a `PlexLinks`,
`mediaServer: 'jellyfinItemId'` a `JellyfinLinks`, `facts` a `FactReporter`. It also refuses a class
declaring `facts` that resolves to no kind (neither a media server nor a declared `providerKind`) or to
no title id column (no address column and no `matchedBy`). A class declaring a capability it cannot
serve does not compile; a `@ts-expect-error` fixture
([`providerClasses.typecheck.ts`](ref:path:server/__tests__/modules/providers/providerClasses.typecheck.ts))
keeps that check honest under `yarn typecheck:server`.

Everything else is read from those declarations, never re-declared:

- [`providerCatalogue.ts`](ref:path:server/modules/providers/providerCatalogue.ts) derives
  `PROVIDER_CATALOGUE`, the setup type list and the type labels; `SOURCE_OWNER`, `isMediaSourceType`
  and `contentTypeOfSourceType` from `source`; `ADDRESS_COLUMN_BY_TYPE` from `mediaServer` or
  `addressedBy`; `isMediaServerType` and `MEDIA_SERVER_BY_COLUMN` from `mediaServer`; and, from
  `facts` and `providerKind`, `reportersOf(fact)`, `reportsFacts(type)`, `titleIdColumnOf(type)` (the
  address column first, then `matchedBy`) and `providerKindOf(type)` (`mediaServer` wins over a
  declared kind, so a redundant declaration is unused, never a second truth). An entry
  carries either a `hostPlaceholder` (a self-hosted type) or a `defaultUrl` (a hosted type), never
  neither.
- The factory ([`providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts)) constructs
  from the map, and answers one query per role (`movieSourcesOf`, `seriesSourcesOf`, `plexServerOf`,
  `jellyfinServerOf`, `factReportersOf`): each keeps the provider rows whose type declares that role
  and returns `{ providerId, name, provider }` typed by the role, narrowed by a type predicate over the
  map's declarations, so neither the queries nor their callers cast. `factReportersOf` adds each
  reporter's title id column and the facts it declares.
- Callers ask for the capability: media's `sourceOwnership()` and the rule registry's content-type
  scoping read `SOURCE_OWNER`; the catalog refresh reads the role queries; the refresh kinds a provider
  writes, the content types an automation's action can address and the filter-choice lists all read the
  declarations. A guard test
  ([`providerTypeNames.test.ts`](ref:path:server/__tests__/modules/providerTypeNames.test.ts)) fails if
  any non-test file in `server/modules` outside one allowlist names a provider type.

**One source per content type is the current rule** (north-star belief 9: "Today each content type is
managed by one kind of service; allowing a second kind for the same content type is a later
requirement."). A unit test over the real class map
([`providerClasses.test.ts`](ref:path:server/__tests__/modules/providers/providerClasses.test.ts))
holds it.

**Adding a provider** that is a source, an actuator addressed by an existing column, or a fact reporter
is its type identity (the `MetadataProviderType` member and the contract's provider-type value), its
connection class (with `catalogueEntry` and the role interfaces it implements) and its entry in the
class map. One departure from belief 9 remains, recorded in the fracture ledger: a new *media server*
still needs its own role query, link interface, link slot in the catalog refresh and database column.
A reported fact no existing service reports still needs its key in `ReportedFacts`, a rule that reads
it and a seeded `enrichment_field` row.

## Multi-instance is real: Radarr/Sonarr may have any number of active instances

`ProviderSettingsService.assertNoActiveConflict` ([`server/modules/providers/providerSettingsService.ts`](ref:path:server/modules/providers/providerSettingsService.ts))
early-returns for `isMediaSourceType(type)` — Radarr and Sonarr carry **no** single-active invariant.
Every other provider type (TMDB, Seerr, Tautulli, Plex, Jellyfin) still enforces it: at
most one active instance, or `assertNoActiveConflict` throws `ValidationError`. This is role-scoped, not
type-hardcoded, so it reads directly off the one authority above.

The factory's role queries are the structural half of this: each returns one entry per configured
row, never collapsing same-type entries into a single slot, so no consumer can silently reintroduce
last-one-wins.

## The identity model: group vs. instance copy

`media_identity`/`media_item` ([`server/database/schema.ts`](ref:path:server/database/schema.ts), migration `0014`) is the spine — a
two-table split between the logical title and each instance's concrete copy of it:

- **`media_identity` is the group** — one row per logical title, no per-source coordinate. Keyed
  per-`contentType` (`movie`/`series`, scoping the primary-id namespace: a TMDB movie id and a TMDB tv id with the
  same number are different titles) by a partial-unique index on its primary id (`tmdbId` for movies,
  `tvdbId` for series).
- **`media_item` is one row per instance's copy**, `UNIQUE(providerId, externalId)` — `providerId` is the
  *configured instance* (`metadata_provider.id`), not the provider type, so a non-4k Radarr and a 4k
  Radarr never collide; both copies attach to the same `media_identity` group when they report the same
  primary id.
- **`resolveGroup(db, contentType, ids)`** ([`server/modules/providers/groupResolver.ts`](ref:path:server/modules/providers/groupResolver.ts)) is the
  sole find-or-create authority for which group an item belongs to: primary id per content type if present;
  otherwise a fallback chain (`imdbId`, then `title`+`year`); otherwise a fresh group. A TMDB or TVDB
  id that is not positive counts as missing: Sonarr reports `tvdbId: 0` for series it cannot match, and
  keying on it would join unrelated series into one group sharing one Plex or Jellyfin id. Migration
  `0036_identity_zero_ids` cleared groups keyed that way, along with the ids they borrowed from their
  first copy, so the catalog refresh's next run regroups those copies by title and year. Identifier fields
  are merged onto an existing group **fill-only** — a found group's non-`NULL` column is never
  overwritten. No code path ever merges two *existing* groups; a group left with zero `media_item` rows
  is swept, not merged away.

## The catalog refresh: the only reader of the providers' library data

`CatalogRefreshJob`, built by `CatalogRefreshJobFactory`
([`server/modules/providers/catalogRefreshJob.ts`](ref:path:server/modules/providers/catalogRefreshJob.ts),
[`catalogRefreshJobFactory.ts`](ref:path:server/modules/providers/catalogRefreshJobFactory.ts)), runs as
the "Catalog refresh" system automation (stored task id `system:identity-resolution`). It is the only code
that reads Radarr, Sonarr, Plex and Jellyfin library data; every feature reads what it stores through the
library cache. Its factory loads the active rows of every type declaring `source` or `mediaServer` and
takes its inputs from the factory's role queries, each typed by its role interface (`MovieSource`,
`SeriesSource`, `PlexLinks`, `JellyfinLinks`, and `TitleLookup` for TVmaze). It loops every active
instance per type, never collapsed to one, and refreshes each provider on its own:

- **Copies.** `runForMovies`/`runForSeries` resolve each listed item's group via `resolveGroup`, upsert
  its `media_item` row on `(providerId, externalId)` with the provider's own record as its payload
  (`media_item_payload`), clear any removed mark, then mark removed that instance's copies it no longer
  lists, and finally sweep every group left with zero `media_item` rows. A removed copy still counts for
  the sweep, so a removed title keeps its group and its name.
- **Links.** `runForPlex`/`runForJellyfin` never insert a group: they stamp `plexRatingKey` /
  `jellyfinItemId` onto groups matching by `contentType` + `tmdbId`/`tvdbId`, and clear the link from
  every title whose item the server no longer lists. Plex ids come from each item's `Guid` list, which a
  listing includes only with `includeGuids=1`; a section whose answer omits `Metadata` is empty.
  `tests/fixtures/plex/` holds a real server's responses for
  [`catalogRefreshJob.test.ts`](ref:path:server/__tests__/modules/providers/catalogRefreshJob.test.ts).
- **Setup lists.** `runForLists` stores each Radarr/Sonarr instance's tags, quality profiles, root
  folders and (Sonarr) language profiles in `provider_lists`
  ([`providerLists.ts`](ref:path:server/modules/providers/providerLists.ts)). Each part is read on its
  own, and a failed part keeps its last successful value. The lists are part of the disposable copy, so
  they live apart from `metadata_provider`, which is the owner's configuration.

### Believing what a provider answers

A successful answer, empty or not, is that provider's truth: copies it no longer lists are marked
removed, links it no longer lists are cleared. An error, timeout or malformed answer is a failure: the
refresh keeps everything it held from that provider, records the failure and moves on to the next
provider. A run in which any provider failed ends in error naming them, each once.

### Refresh records

[`providerRefresh.ts`](ref:path:server/modules/providers/providerRefresh.ts) owns `provider_refresh`:
one row per provider and kind, holding `refreshedAt` (last success) and `failedAt`/`error` (latest
failure, cleared on success). Each kind has one writer: `catalog`, `links` and `lists` the catalog
refresh, `facts` Enrichment. The records are how every view says how current it is, and what a
destructive run checks before acting (see below).

## Removed copies and run history

`media_item.deleted` ([`server/database/schema.ts`](ref:path:server/database/schema.ts)) marks a copy its
instance no longer lists. A removed copy is usually the result of a destructive run, which is exactly the
item that run's history must still name, so the row stays and is marked. The library cache leaves removed
copies out, so no feature shows or acts on them. `resolveGroup` reads only `media_identity`, so a title that
returns reuses its retained group, and the upsert clears the mark on the same row.

`automation_run_items(runId, mediaItemId, title, year)` links a run to every copy it targeted
(`AutomationRunService.listRunItems` / `listItemRuns`,
[`server/modules/automations/automationRunService.ts`](ref:path:server/modules/automations/automationRunService.ts)).
A run takes its targets' `media_item` ids straight from the library cache, so every target is a recorded
copy and a run never writes to the identity tables. A link keeps the title and year from when the run
targeted the copy, so a run's history outlives the media rows: removing copies through a provider's
deletion or a media reset empties `mediaItemId`, and the run still lists those titles as removed. Each run
also records how current the copy it acted on was (`freshnessAsOf`, `freshnessStale`). `createRun` writes the run row
and its links in one `db.batch`, a single SQLite transaction. A user run's `itemCount` is the number of
copies it targeted.

## Facts: declared once by the service that supplies them

A **fact** is something one service tells Warden about a title. There are two kinds, and every fact is
one or the other:

- A **catalog fact** is a value the content type's source supplies in its catalog record: title, year,
  has file, tags, genres, network, certification and the rest of
  [`MovieCatalogRecord`](ref:path:server/modules/media/movie.ts) and
  [`SeriesCatalogRecord`](ref:path:server/modules/media/series.ts). The source's `source` declaration
  says it supplies them; they are not listed per key.
- A **reported fact** is a value a non-source provider reports about titles it can address, declared by
  key on that provider's connection (`capabilities.facts.reports`) and named for what it means, never for
  the product that reports it (`addedToMediaServerAt`, `requestStatus`, `productionStatus`). The value
  type of each is [`ReportedFacts`](ref:path:server/modules/providers/facts.ts).

A compile check beside the records ([`mediaItem.ts`](ref:path:server/modules/media/mediaItem.ts),
`NoReportedFacts`) fails when a catalog record key is also a reported fact key, with a fixture proving
it fires: a provider reporting a catalog fact would need an owner decision on source-versus-reporter
precedence first. `NormalizedMovie`/`NormalizedSeries` are a catalog record plus `Partial<ReportedFacts>`.

**The rule:** a fact is a catalog fact (the content type's source supplies it) or a reported fact
(declared by key on the reporting connection, named for what it means). Anything that needs "who
supplies this" derives it from the declarations, never from a list of its own; and precedence ranks
kinds of provider, never named providers.

Each reporting connection implements `FactReporter.readReportedFacts(titleIds)`, translating its own
payload into the common fact shape keyed by the title id its declaration names (Plex and Tautulli by
rating key, Jellyfin by item id, Seerr and TMDB by TMDB id; TMDB looks up the ids it is asked about, the
others read everything). Everything that needs to know who supplies a fact derives it:

- **Enrichment** ([`enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts)), the scheduled
  refresh of reported facts, runs over `factReportersOf` every active provider row. For each reporter it
  collects the titles' ids in its title id column, calls `readReportedFacts`, gives every title an id
  names the answer for that id (a movie and a series can share a TMDB id), and stores only the facts the
  reporter declares, with defined values, through `EnrichmentQueries.replaceProviderFacts`. A failed
  answer or a failed write records that reporter's `facts` refresh as failed, keeps what Warden held from
  it, and the run goes on to the next reporter.
- **The library cache's refresh kinds** give a `facts` record to every type that `reportsFacts`.
- **Rules** say what they read (`MediaRule.reads`: `'catalog'` or one reported fact), and
  [`suppliersOf(rule, contentType?)`](ref:path:server/modules/media/ruleRegistry.ts) answers the content
  type's source for a catalog rule and `reportersOf(fact)` otherwise, unioned over the rule's content
  types when none is asked. Rule offering, filter readiness and a destructive run's dependencies all read
  it. A compile check fails when a reported fact has no rule that reads it.
- **Precedence** ([`REPORTED_FACT_PRECEDENCE`](ref:path:server/modules/providers/facts.ts)) lists, for each
  fact more than one kind of provider reports, those kinds in order: play count and last watched take a
  watch-history tracker's value before a media server's.
  [`resolveFacts`](ref:path:server/modules/media/enrichmentMerge.ts) applies it per title when the cache
  loads; between two providers of the same kind it takes the first connected (lowest provider id), and a
  title only one of them holds keeps that one's value. The owner's choice between two of a kind
  (north-star belief 3: "between two of the same kind, the owner's choice wins, or the first connected
  until they choose") is not built yet (#264): the stored `primaryMediaServer` setting is not applied. A
  test over every declaration fails when a fact is reported by two or more kinds and one is missing from
  its order.

Facts are stored per provider, one row per title, fact and provider, so no provider's value is lost at
write time; see [the EAV model](ref:path:docs/architecture/media-enrichment-eav-model.md).

## The MediaSource role and the copies it supplies

`MediaSource` is the source role's interface
([`roles.ts`](ref:path:server/modules/providers/roles.ts)): the setup lists a catalog-owning
connection answers (tags, quality profiles, root folders, and Sonarr's language profiles), extended by
`MovieSource` (`getMovies`) and `SeriesSource` (`getSeries`). It is what the catalog refresh reads from
a connection declaring `source`; no other code reads a source connection. The library cache
([`libraryCache.ts`](ref:path:server/modules/media/libraryCache.ts)) loads each
stored copy normalised and carrying `providerId`, its native id, the logical `tmdb`/`imdb`/`tvdb` ids,
its title group and its facts. The query engine judges those copies directly
([`mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts)). `sourceOwnership`
([`mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts)) projects `SOURCE_OWNER`
for the client. The source role interfaces are typed by Radarr's and Sonarr's own payloads
(`RadarrMovie`, `SonarrSeries`), a departure from belief 9 recorded in the fracture ledger.

## Same title everywhere

The catalog refresh decides which copies are one title, with one rule (`resolveGroup`), and every
feature reads that grouping:

One evaluation, `MediaQueryEngine.select`, answers which titles a set of conditions selects, and every
reader of the catalog reads its answer (north-star belief 3: a title is every edition of it everywhere,
and each condition is judged on the title as a whole, for included and excluded queries alike):

- **Browse** shows one row per selected title, represented by its first copy in the requested sort that
  alone meets the filters (or its first copy in that sort when only different copies together meet
  them), with `sourceCount` and `sourceProviderIds` counting every copy; pagination and totals count
  titles.
- **Query counts** count selected titles.
- **Exclusion** protects the whole title for every actuator: a title meeting an excluded query, through
  any instance's copies, is not acted on.
- **Catalog-owning actuators** (Radarr, Sonarr) act on their own instance's copies of every selected
  title, including a title selected only through another instance's copy.
- **Non-source actuators** (Plex, Jellyfin, Tautulli) address a title by the media-server id the catalog
  refresh linked to it, recording the title once; a title not linked drops out. The link model holds one
  id per title, a departure from belief 3 recorded in the fracture ledger.

### Destructive runs and the records they depend on

A destructive run checks the refresh records of what it reads before acting (north-star belief 7: a
service that has never been read counts as one that failed to answer, and a fact another connected
service still supplies does not depend on the one that failed). The rule lives in
[`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts):

- **Providers it needs, each one.** The `catalog` record of the instances it reads: a catalog-owning
  actuator's own instance (any other actuator: every active source instance of the content type); for
  each filter whose value names an instance, that instance; for each other filter on a catalog fact,
  every active source instance, since any instance's copy may meet it. And the `links` record
  of the media server whose ids it addresses. Any of these failed or never read skips the run, naming the provider and the kind.
- **Reported facts it filters on, once each.** For each reported-fact rule in its included or excluded
  queries, the run needs one active reporter from `suppliersOf` whose `facts` record succeeded and, for
  a reporter matched through a media server's links (its `titleIdColumnOf` is that server's column,
  `MEDIA_SERVER_BY_COLUMN`), whose server's `links` record succeeded too
  ([`providerCatalogue.ts`](ref:path:server/modules/providers/providerCatalogue.ts)); a reporter matched
  by TMDB id has no links dependency. Play count from Plex and Jellyfin survives Plex failing while
  Jellyfin refreshed. Only a rule none of whose reporters is good skips the run, naming the fact and why
  each reporter failed. A catalog-fact rule adds no facts dependency, so a filter on Year or Has file
  never waits on a media server. Whether each reporter can be relied on is one function over the loaded
  copy, [`reporterReliability`](ref:path:server/modules/media/libraryCache.ts); the gate and filter
  readiness's `data-incomplete` both read it, so they give one answer.

Non-destructive runs proceed, and nothing here judges a run by how much it would affect.

**Instance-scoped filter values.** `qualityProfileIds`, `languageProfileIds` and `tagIds` are
provider-*minted* numeric id spaces — each instance numbers its own profiles/tags independently, so
instance A's id `1` and instance B's id `1` are two unrelated things. `MediaRule.instanceScoped`
(`ruleRegistry.ts`) marks exactly these rule variants (movie/series × tags/profiles, plus series language
profiles); every other rule (strings, universal facts, computed measures) is unaffected. The value of an
instance-scoped rule is an `InstanceScopedValue`, `{ providerId?, ids }`: `providerId` is the configured
instance whose namespace the `ids` belong to, so a `Filter { ruleKey, value }` stays exactly a rule key
and a value. Omitting `providerId` means unqualified (today's pre-multi-instance semantics: each id is
interpreted in each copy's own instance's namespace). That is exact in a single-instance deployment; with
several instances of the content type, an unqualified id can be met by another instance's unrelated tag
or profile that happens to share the number, since every evaluation judges every active instance's
copies. The stored value is that
object as JSON in `media_query_filter_values.value` (migration `0029` folded the former `providerId`
column into it). The gate lives once, where `select` turns a filter into a test of one copy
([`server/modules/media/mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts)): a
value that names a `providerId` is satisfied only by the copy whose `_sourceIds.providerId` equals it,
never by a different instance's coincidentally-matching id. The title that copy belongs to is then
selected as a whole, so a Radarr automation whose query names another instance's tag acts on its own
copies of the titles that tag selects. Filter readiness
([`server/modules/media/filterReadiness.ts`](ref:path:server/modules/media/filterReadiness.ts)) surfaces
the misconfiguration rather than leaving a silent mismatch: `inactive-instance` for a value naming an
instance that is not an active source of the content type (inactive, deleted, or of the wrong type),
for every actuator. Deleting a provider leaves the `providerId` in any
filter value that names it, so the filter matches nothing and its query reports `inactive-instance`; it
never widens to another instance's ids, which name different tags and profiles.

The client mirrors this: when a rule's owning content type has more than one active instance
(`useMediaSources()`), `MediaFilterBar` gives `MultiSelectFilter` each option's instance as its group,
so options render in labeled per-instance sections. If every currently-selected option resolves to
exactly one instance, the bar reports that instance for the value to be saved with; a selection spanning
instances (or none) falls back to the unqualified interpretation, and the control shows a note saying so. With exactly one
active instance the control renders flat and saves unqualified values — the stored shape of a
single-instance deployment carries no `providerId`.

## Remaining limitations

1. **No version/edition concept.** A logical title is assumed to be one concrete item per instance. Real
   sources can expose several editions from *one* instance (a single Plex item with multiple
   quality-optimized versions) — distinct from the multi-*instance* case the identity model above
   already handles.
2. **Media servers cannot own.** Plex and Jellyfin both only report facts — neither can produce a catalog row,
   the same limitation `docs/architecture/media-providers.md`'s Jellyfin entry documents in full.
