---
type: wayfinder-spec
label: wayfinder:spec
provider: radarr
status: implementing
source_ticket: docs/in_progress/provider-e2e-spec/tickets/03-radarr-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/radarr.md
---

# Radarr — E2E spec

Radarr is a `MediaSource` (movie) + `MediaActuator` — its own fields normalize directly onto
`NormalizedMovie` (`normalizeMedia.ts`) with no enrichment step, and its tasks are real API calls
(`radarrProvider.ts`). This spec extends that existing shape; it doesn't change Radarr's role.

## Bug fixes (in scope, not new capability)

| Bug | Fix |
|---|---|
| `monitored` filter rule is series-only (`contentTypes: ['series']`), so it never matches movies even though `NormalizedMovie.monitored` is already populated from Radarr. | Extend the rule's `contentTypes`/`providers` to include movies. |
| `addedDaysAgo`'s `providers` lists `PLEX` alongside `RADARR`/`SONARR`, but nothing populates `NormalizedMovie.addedDate` from Plex — stale listing. | Remove `PLEX` from `addedDaysAgo`'s `providers`. Radarr's `added` (addedAt-to-source) and Plex's `plexAddedAt` (addedAt-to-library/import) are permanently distinct concepts, not one field with competing producers — they must never be merged under one precedence rule, in this ticket or the final precedence ticket. |

## Fields to wire

All new fields follow the existing unprefixed pattern for source-owned movie fields (Radarr fields
normalize straight onto `NormalizedMovie`, no `radarr`-prefix needed except where flagged for
collision below). Flow: `radarrProvider.ts` (`RadarrMovie`) → `normalizeMedia.ts`
(`normalizeRadarrMovie`) → `NormalizedMovie` → `ruleRegistry.ts`.

| Domain field | Source | Notes |
|---|---|---|
| `folderName` / `path` | `folderName`, `path` | Filesystem location — UI filter + display. |
| `movieFileCount` | `statistics.movieFileCount` | |
| `releaseGroups` | `statistics.releaseGroups` | |
| `overview` | `overview` | Display (plot synopsis), not a filter target. |
| `inCinemasDate` / `physicalReleaseDate` / `digitalReleaseDate` | `inCinemas`, `physicalRelease`, `digitalRelease` | Distinct milestones from `added`/`year` — enables filters like "digital release within 30 days". |
| `originalTitle` / `originalLanguage` / `alternateTitles` / `secondaryYear` / `sortTitle` / `cleanTitle` / `titleSlug` | title-variant fields | Mostly sort/display helpers, limited standalone filter value — wire for completeness/display. |
| `studio` | `studio` | Production company. |
| `collectionName` / `collectionTmdbId` | `collection.{name,tmdbId}` | Flattened scalar pair (not a relational join) — fits the existing `media_enrichment` EAV shape with no schema change. Supports "filter by collection name," not an efficient "list all movies in collection X" query. |
| `runtime` | `runtime` | Minutes — "runtime under 90 min" filter. |
| `isAvailable` | `isAvailable` | Computed availability flag. |
| `radarrStatus` | `status` (`tba`/`announced`/`inCinemas`/`released`/`deleted`) | **Radarr-prefixed to avoid collision** with `NormalizedSeries.status` (series continuing/ended — different enum, different meaning). Flag for precedence ticket. |
| `minimumAvailability` / `rootFolderPath` | `minimumAvailability`, `rootFolderPath` | Config-surface — expose as read-only detail, not a filter widget. |
| `website` / `youTubeTrailerId` | `website`, `youTubeTrailerId` | External links, display only. |

**Not wired, no action needed**: `profileId` — legacy/duplicate of `qualityProfileId`, appears dead in
Radarr's own API. No wiring; flagged for completeness only.

**Ratings extracted to a dedicated intent doc, not wired as `EnrichmentFields` here**:
`ratings.imdb.votes`, `ratings.tmdb.{value,votes}`, `ratings.metacritic.{value,votes}`,
`ratings.rottenTomatoes.{value,votes}`, `ratings.trakt.{value,votes}` — all moved to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md), which now owns
the full per-provider ratings inventory and the reasoning for why ratings don't fit the
shared-EnrichmentFields/precedence pattern the rest of this spec uses. The already-live `imdbRating`
field (movie, wired today) is unaffected — this only concerns net-new rating fields this spec had
proposed.

## Tasks / automation options

Already real (unchanged): `unmonitorMovie`, `triggerSearch`, `deleteMovieWithFiles`,
`changeQualityProfile`, `addTag`, `removeTag`.

| New/completed task | Endpoint | Notes |
|---|---|---|
| `deleteMovieKeepFiles` | DELETE `movie/{id}` with `deleteFiles=false` | Completes the existing `modelledRun` stub — same shape as `deleteMovieWithFiles`, different flag. |
| `moveMovie` | `MoveMovieCommand` / `BulkMoveMovieCommand` | Parameterized by target root folder (list already fetched via `getRootFolders()`, previously unused). |
| `refreshMovie` | `RefreshMovie` command | Re-pull metadata from Radarr's own metadata source; distinct from `triggerSearch`. |
| `rescanMovie` | `RescanMovie` command | Rescan the movie's folder on disk for unindexed files; distinct from `refreshMovie` and `triggerSearch`. |
| `renameMovies` | `RenameMovies` command | Apply the configured naming scheme to already-imported files. |
| `refreshCollection` | `RefreshCollectionsCommand` | Refresh collection metadata — only meaningful now that `collectionName`/`collectionTmdbId` are wired. |

**Out of scope this pass**: `MissingMoviesSearch` and `DownloadedMoviesScan` (instance-scoped, don't
fit the per-item `ActuatorTask.run(ids)` shape) — flagged as future work needing a new task kind.

## Out of scope (structural, flagged not designed)

- **Queue** (`GET /queue`) and **history** (`GET /history`) endpoints — 1:N per movie (many queue
  entries/history events over time), doesn't fit the `media_enrichment` EAV shape (one fact per
  identity+field). Needs its own table if ever built. Different UI shape too (event-log/progress
  view, not a filter predicate).
- Instance-scoped commands (`MissingMoviesSearch`, `DownloadedMoviesScan`) — every existing task is
  `run(ids)`, scoped to specific movies; these operate on the whole instance with no item scope.

## Naming-collision notes (for the final precedence ticket)

- **`added`** — Radarr's `added` (addedAt-to-source) must stay permanently distinct from Plex's
  `plexAddedAt` (addedAt-to-library/import). Already separate filter rules (`addedDaysAgo` vs
  `plexAddedDaysAgo`) — this spec's bug fix (removing the stale Plex listing from `addedDaysAgo`)
  reinforces that separation; the precedence ticket should treat this as settled, not open.
- **`radarrStatus`** vs `NormalizedSeries.status` — different enums (movie release lifecycle vs series
  continuing/ended), disambiguated by the `radarr`-prefix.
- **`certification`** — shared verbatim across Radarr/Sonarr/TMDB/OMDB; different providers may format
  strings differently (`"PG-13"` vs country-prefixed). Value-format risk, not a name collision — flag
  for precedence ticket since the filter predicate does exact case-insensitive string match.

## Implementation status

Every row below is implemented except `runtime`/`studio`: both are already-live
`EnrichmentFields` keys with Plex as sole current producer, so wiring Radarr in now would make it
a second, uncoordinated producer with no precedence ordering between them. Blocked on
`_precedence.md`'s implementation landing precedence-ordering machinery first. Tracked in
`specs/_implementation-map.md`.

## Filter type mapping

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `folderName` / `path` | — | — | **Corrected in "UI decisions" below**: not filterable this pass. `string` dataType is a fixed-`ENUM_OPTIONS` picker, not free text (confirmed against `RuleControl`) — substring-match-on-path doesn't fit any existing control. Left display-only, same as `overview`/title-variant fields, rather than inventing a new generic free-text `dataType` unilaterally. |
| `movieFileCount` | `movieFileCount` | `range` | **Corrected in "UI decisions" below**: reclassified from `number` to `range` — same shape as `sizeOnDiskGb`; a range with equal min/max still expresses exact-count match, and avoids inventing new UI for a value space with no natural small enum. |
| `releaseGroups` | `releaseGroups` | `csv-strings` | New rule. Multi-select-by-string-value, same shape as `genres`/`certification`. |
| `overview` | — | — | No filter, display/on-demand only (plot synopsis). |
| `inCinemasDate` | `inCinemasDaysAgo` | `range` | New rule. Date-shaped field modeled as "days ago" range, per the `addedDaysAgo`/`plexAddedDaysAgo` convention. |
| `physicalReleaseDate` | `physicalReleaseDaysAgo` | `range` | New rule. Same days-ago convention. |
| `digitalReleaseDate` | `digitalReleaseDaysAgo` | `range` | New rule. Same days-ago convention; spec's own example ("digital release within 30 days") is exactly this shape. |
| `originalTitle` / `originalLanguage` / `alternateTitles` / `secondaryYear` / `sortTitle` / `cleanTitle` / `titleSlug` | — | — | No filter, display/sort-helper only — spec flags these as "limited standalone filter value," wired for completeness/display, not as filter predicates. |
| `studio` | `studio` | `csv-strings` | New rule. Multi-select-by-string-value, same shape as `network` (show-side). |
| `collectionName` / `collectionTmdbId` | `collectionName` | `csv-strings` | **Resolved in "UI decisions" below**: `collectionName` gets its own new rule + dedicated lookup route (not covered by Plex/Jellyfin). `collectionTmdbId` stays unfiltered — no confirmed id-based use case. |
| `runtime` | `sizeOnDiskGb`-style new `range` rule (`runtimeMinutes`) | `range` | New rule — spec's own example ("runtime under 90 min") is a range/bound query, same shape as `sizeOnDiskGb`. No existing runtime rule exists to join. |
| `isAvailable` | `isAvailable` | `boolean` | New rule. Same shape as `hasFile`/`monitored`. |
| `radarrStatus` | `radarrStatus` | `string` | New rule, deliberately not joining `seriesStatus` — different enum (movie release lifecycle vs series continuing/ended), same reasoning the spec already gives for the field's name prefix. |
| `minimumAvailability` / `rootFolderPath` | — | — | No filter, read-only config-surface detail per spec. |
| `website` / `youTubeTrailerId` | — | — | No filter, display-only external links. |

Ratings fields (`ratings.imdb.votes`, `ratings.tmdb.*`, `ratings.metacritic.*`, `ratings.rottenTomatoes.*`,
`ratings.trakt.*`) are out of scope here — tracked in
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md).

### Tasks (automation options)

| Task | Parameter shape |
|---|---|
| `deleteMovieKeepFiles` | none |
| `moveMovie` | single-select (target root folder) |
| `refreshMovie` | none |
| `rescanMovie` | none |
| `renameMovies` | none |
| `refreshCollection` | none |

## UI decisions

Same generic-control survey as `specs/plex.md`'s "Per-field widget shapes" and `specs/jellyfin.md`'s
mirror of it — **no field needed a `/prototype` session or a further `impeccable` pass.** Radarr adds
zero new widget shapes to `RuleControl`; every filterable field maps onto the four generic renderers
already established (`range` → `NumberRangeFilter`, `csv-strings` → `StringMultiSelectDropdown`,
`boolean` → `OptionFilter` with `booleanOptions`, `string`/`number` → `OptionFilter` with a fixed
`ENUM_OPTIONS` entry). This closes out the four items the ticket flagged for scrutiny:

### `radarrStatus` — confirmed as `string`/`ENUM_OPTIONS`, real enum decided

Radarr's own `status` field enum, per `docs/in_progress/provider-e2e-spec/research/radarr.md`'s
Radarr-API audit: `tba` / `announced` / `inCinemas` / `released` / `deleted`. This is the actual
value set the provider returns (not just a filter-shape guess), so `radarrStatus` is a legitimate
`ENUM_OPTIONS`-backed `string` rule — same shape as `seriesStatus`/`tmdbStatus`, no bespoke control.
Add to `ENUM_OPTIONS` (`ref:src/components/MediaFilterBar/index.tsx#L885`):

```
radarrStatus: [
  { value: 'tba', label: 'TBA' },
  { value: 'announced', label: 'Announced' },
  { value: 'inCinemas', label: 'In Cinemas' },
  { value: 'released', label: 'Released' },
  { value: 'deleted', label: 'Deleted' },
]
```

Without this entry the rule would render nothing (`ruleRendersControl` correctly excludes any
`string`/`number` rule missing an `ENUM_OPTIONS` entry) — this decision is what makes the field
actually filterable, not just typed in the registry.

### `folderName` / `path` — dropped from filterable scope this pass, not given a new control

Confirmed by reading `RuleControl`'s `string`/`number` branch and `ENUM_OPTIONS`
(`src/components/MediaFilterBar/index.tsx` ~L880-988): `string` dataType is *only* a fixed-enum
picker keyed by `ENUM_OPTIONS[rule.key]`, never free text. A substring-match-on-filesystem-path
filter is not enumerable, so `folderPath`'s `dataType: 'string'` classification in the mapping table
above does not fit any control this codebase has today — confirmed by grepping every `dataType` in
`ruleRegistry.ts`: only `string` / `range` / `boolean` / `csv-strings` / `csv-ids` exist, no
free-text/substring type anywhere in the registry.

**Decision: leave `folderName`/`path` unfiltered (display-only) for this pass**, rather than
inventing a new generic "free text" `dataType`/control. Reasoning:

- Inventing a new shared `dataType` is a bigger decision than one provider's UI ticket should make
  unilaterally — it would set a pattern every future `RuleControl` consumer and every other spec in
  this map inherits, and no other provider's fields have surfaced a genuine need for it yet (a
  second, independent occurrence would be a much stronger signal to build it).
  Radarr's own decision ticket already treats `folderName`/`path` as "UI filter + display," but nothing
  in this map's remaining 6 providers' fields (audited via `specs/*.md`) obviously needs a substring
  filter either — this doesn't look like it's about to become a recurring shape.
- This matches existing precedent directly: `overview` and the title-variant fields
  (`originalTitle`/`alternateTitles`/etc.) are already wired-but-unfiltered "display only" in this
  same spec's mapping table, for the same underlying reason (no fitting filter shape, wiring for
  display value alone still has value).
- No `/prototype` session was run, since the map's own trigger for `/prototype` is "real UI
  complexity" surfacing during the *widget-shape* decision for a field already slated to be
  filterable — here the decision is to not filter it at all, which resolves the question rather than
  needing prototyping to answer it.

**Correction to the "Filter type mapping" table above**: `folderName`/`path`'s row should be read as
no filter rule (drop the `folderPath` filter key / `string` dataType entry), keeping `folderName`/`path`
wired only for display, matching `overview`'s and the title-variant fields' rows.

**Flag for a future ticket, not resolved here**: if a later provider's UI ticket independently hits
the same "substring match on an open-ended string field" need, that is the point to design a shared
free-text filter control (worth its own `/prototype` session then) — this ticket does not preempt
that design.

### `movieFileCount` — reclassified to `range`

Confirmed the concern: `number` dataType (per `RuleControl`'s `string`/`number` branch) is the same
fixed-`ENUM_OPTIONS`-picker shape as `string`, not a numeric input — `movieFileCount`'s actual value
space (0, 1, 2, 3…) has no natural small enum, so an `ENUM_OPTIONS` entry doesn't fit the way
`overseerrRequestStatus`'s small fixed status-code set does.

**Decision: reclassify `movieFileCount` to `range` dataType**, same shape as `sizeOnDiskGb`. A
`NumberRangeFilter` with equal min/max still expresses an exact-count match (e.g. "movieFileCount = 0"
to find movies with no file), while also supporting "1 or more" / "between 2 and 5" queries the spec's
original "exact-count match" framing didn't anticipate but which cost nothing extra with this control.
No new widget — reuses the existing generic range renderer.

**Correction to the "Filter type mapping" table above**: `movieFileCount`'s dataType is `range`, not
`number`.

### `collectionName` / `collectionTmdbId` — scoped to `collectionName` only

Closing the decision ticket's open scoping question: **`collectionName` gets its own new
`csv-strings` rule and its own dedicated lookup route** (`listCollectionNames` or equivalent,
following `listNetworks`/`listGenres`'s established shape — in-process `MediaCache<string[]>`,
dedupe+sort over already-fetched Radarr movie data). This is a genuinely new open-ended string field,
not one Plex's or Jellyfin's UI passes already named a route for (checked both specs' "UI decisions"
sections — neither mentions collection name/grouping at all), so it doesn't reuse an existing route
the way `studio` does (see below).

**`collectionTmdbId` stays unfiltered** — no rule. The spec is explicit that the only confirmed need is
"filter by collection name," and no id-based "list movies in collection X" use case has been
confirmed. Wiring an unused `csv-ids` rule (which would additionally need its own id→label lookup,
i.e. collection id → collection name, doubling the new-route surface for a rule nothing asks for)
isn't justified speculatively; add it later if an id-based use case is actually confirmed.

### Per-field widget shapes — full mapping

- **`range` fields** (`inCinemasDaysAgo`, `physicalReleaseDaysAgo`, `digitalReleaseDaysAgo`,
  `runtimeMinutes`, and the reclassified `movieFileCount`) render via `NumberRangeFilter`, same shape
  as `sizeOnDiskGb`/`addedDaysAgo`. No new bounds decided, consistent with Plex's/Jellyfin's
  precedent of leaving numeric rules unbounded.
- **`csv-strings` fields**: `releaseGroups` and `collectionName` are genuinely new to this map and
  each get their own dedicated lookup route, following `listNetworks`/`listGenres` exactly — an
  in-process `MediaCache<string[]>`, dedupe+sort over already-fetched Radarr data, added to the
  `Lookups` interface and wired into `csvStringOptions`, shipped together with the route in the same
  change (not a follow-up), per the known-gap warning Plex's UI pass first recorded for
  `certification`. **`studio` is not new** — Plex's UI pass already named and reconciled a shared
  `studio` route across Plex/Radarr/Jellyfin (`specs/plex.md`'s "Options-source decision"); Radarr
  joins that route as an additional producer, no new route needed.
- **`boolean`**: `isAvailable` renders via `OptionFilter`/`booleanOptions`. No entry in
  `BOOLEAN_VALUE_LABELS` today for this key — following Jellyfin's `jellyfinIsFavorite` precedent,
  add an `isAvailable` entry (`['Available', 'Unavailable']`) rather than leaving it on the generic
  Yes/No fallback, since "Available: Yes/No" reads ambiguously as a filter chip.
- **`string`/`ENUM_OPTIONS`**: `radarrStatus` only (see above) — no bespoke control.
- **Dropped from filterable scope**: `folderName`/`path` (see above), plus the already-noted
  `movieFileCount`→`range` and the not-filtered set (`overview`, title-variant fields,
  `minimumAvailability`/`rootFolderPath`, `website`/`youTubeTrailerId`, `collectionTmdbId`).

### Tasks

- **`deleteMovieKeepFiles`, `refreshMovie`, `rescanMovie`, `renameMovies`, `refreshCollection`** — no
  parameter, no automation-UI decision needed; render on the existing plain id/label task list
  unchanged.
- **`moveMovie`** needs a parameter (target root folder) — per this map's cross-cutting finding
  (`AutomationBuilder` has no parameter-input UI at all today), **this ticket does not design a
  one-off parameter input for it** — deferred to
  [`tickets/11-automation-task-parameters.md`](../tickets/11-automation-task-parameters.md). A note
  recording `moveMovie`'s parameter shape (single-select, sourced from Radarr's configured root
  folders via the already-fetched-but-previously-unused `getRootFolders()` — a lookup, not free
  text) has been appended to that ticket's body.
