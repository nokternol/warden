# Provider Roles & the Media Identity Model

As of 2026-07-12, this documents the model the code *actually* implements today, including its
remaining limits — recorded as architecture rather than intent because the hierarchy and the
multi-instance identity model described below are real and load-bearing, not an unstarted plan.

**Scope:** this covers the **MediaSource** role, the group/instance identity model underneath it, and
the enricher role's relationship to that model. (The enricher role is the `MediaEnricher` contract —
`enrich(items): EnrichmentResult` — re-grounded in Phase 2.5; its full spec is
`docs/architecture/media-enricher-role.md`.) The third role a system can play — **MediaActuator**
(tasks/actions) — is the role-owned task model in `docs/architecture/actuator-task-ownership.md`.

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
| **Enricher** | Tautulli, Plex, Jellyfin, Seerr, TMDB / OMDB / TVMaze | Decorate owner rows by shared key; contribute nothing standalone |
| **Inert toward catalog** | Plex-as-*owner*, Jellyfin-as-*owner* | Cannot produce a catalog row at all |

With no Radarr and no Sonarr configured, the app is effectively empty: browse lists, identity
resolution, and enrichment all short-circuit to nothing (see the pipeline below).

## The single authority for catalog ownership

[`providers/roles.ts`](ref:path:server/modules/providers/roles.ts) declares `SOURCE_OWNER: Record<ContentType, MetadataProviderType>`
(`movie → RADARR`, `series → SONARR`) plus `isMediaSourceType`/`contentTypeOfSourceType` derived from it. This is
the *only* place that fact is declared:

- `media/mediaSourceFactory.ts`'s `sourceOwnership()` (the `GET /api/media/sources` wire projection) and
  the rule registry's per-content-type scoping both build on it — media never
  re-declares the map, only imports it (the one legal `media → providers` direction).
- `ProviderSettingsService.assertNoActiveConflict` reads `isMediaSourceType` to decide whether the
  single-active-provider invariant (D8) applies — see below.
- The catalog refresh reads `SOURCE_OWNER`/`contentTypeOfSourceType` to know which provider types to fetch
  and which content type (`contentType`) to resolve their items under.

A type graduating into the `MediaSource` role (Plex, per the still-open intent doc) would extend this one
map; every consumer above inherits the change without its own edit.

## Multi-instance is real: Radarr/Sonarr may have any number of active instances

`ProviderSettingsService.assertNoActiveConflict` ([`server/modules/providers/providerSettingsService.ts`](ref:path:server/modules/providers/providerSettingsService.ts))
early-returns for `isMediaSourceType(type)` — Radarr and Sonarr carry **no** single-active invariant.
Every other provider type (TMDB, Seerr, Tautulli, Plex-as-enricher, Jellyfin) still enforces it: at
most one active instance, or `assertNoActiveConflict` throws `ValidationError`. This is role-scoped, not
type-hardcoded, so it reads directly off the one authority above.

`ProviderFactory.createInstances(providers, logger)` ([`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts))
is the structural half of this: it returns one `{ settings, provider }` entry per configured row, never
collapsing same-type entries into a single slot. `ProviderSet` (the older `createMany` result) has no
`radarr`/`sonarr` slots at all — the type system cannot express "the Radarr instance" any more, so no
future consumer can silently reintroduce last-one-wins.

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
library cache. It loops every active instance per type, never collapsed to one, and refreshes each
provider on its own:

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
refresh, `facts` the enrichment job. The records are how every view says how current it is, and what a
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

## Enrichment: facts per provider

The enrichment job (`EnrichmentJob.run`, [`server/modules/media/enrichmentJob.ts`](ref:path:server/modules/media/enrichmentJob.ts))
reads every active enricher for every title on every run, hydrating each `media_identity` row into a
canonical item (`_sourceIds.identity` is the group's surrogate id), and stores each provider's facts as it
reported them. Precedence between providers is applied when the library cache loads. See
[the EAV model](ref:path:docs/architecture/media-enrichment-eav-model.md) and
`docs/architecture/media-enricher-role.md`.

## The MediaSource role and the copies it supplies

`MediaSource` names one thing: the role of a catalog-owning provider type (Radarr, Sonarr;
`isMediaSourceType`, [`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts)).
A source connection implements no media read interface: the catalog refresh stores what it answers,
and the library cache ([`libraryCache.ts`](ref:path:server/modules/media/libraryCache.ts)) loads each
stored copy normalised and carrying `providerId`, its native id, the logical `tmdb`/`imdb`/`tvdb` ids,
its title group and its facts. The query engine judges those copies directly
([`mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts)). `sourceOwnership`
([`mediaSourceFactory.ts`](ref:path:server/modules/media/mediaSourceFactory.ts)) projects `SOURCE_OWNER`
for the client.

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
  each filter whose value names an instance, that instance; for each other filter on a field a source
  supplies, every active source instance, since any instance's copy may meet it. And the `links` record
  of the media server whose ids it addresses. Any of these failed or never read skips the run, naming the provider and the kind.
- **Facts it filters on, once each.** For each rule in its included or excluded queries, the run needs
  one active supplier whose `facts` record succeeded and, for a supplier reached through a media
  server's links, whose server's `links` record succeeded too (derived from `ADDRESS_COLUMN_BY_TYPE` and
  `MEDIA_SERVER_BY_COLUMN`, [`actuatorIdResolver.ts`](ref:path:server/modules/media/actuatorIdResolver.ts);
  Seerr has no links dependency). Play count from Plex and Jellyfin survives Plex failing while
  Jellyfin refreshed. Only a rule none of whose suppliers is good skips the run, naming the fact and why
  each supplier failed.

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
2. **Media servers cannot own.** Plex and Jellyfin both only enrich — neither can produce a catalog row,
   the same limitation `docs/architecture/media-providers.md`'s Jellyfin entry documents in full.
