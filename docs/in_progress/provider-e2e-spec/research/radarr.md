# Radarr — API surface audit

Enumeration only (per ticket constraint) — no curation, no build decisions. "Wired" cites the
exact file/line; "not-wired" names which spec layer(s) it would touch if built:
**db/config**, **provider field**, **UI filter**, **query engine**, **enrichment**, **task/actuator**,
**automation**.

Sources: Radarr's official docs (`radarr.video/docs/api/`, Swagger UI — JS-rendered, could not be
scraped directly), the community `pycliarr` Python client's model classes (mirrors the v3
`MovieResource` schema), Radarr's GitHub source (`NzbDrone.Core/Movies/Commands/*.cs`,
`RefreshMovieCommand.cs` read directly), `arrapi` (Kometa's Radarr client) docs, and DeepWiki's
Radarr architecture pages. Field-level confidence is high for the flat `MovieResource` fields
(cross-confirmed across 3 sources); command-name confidence is high for the four
`Movies/Commands/*.cs` files enumerated directly off GitHub, medium for the remainder (named
consistently across arrapi/pycliarr/community docs but not read from source in this pass).

## 1. Movie resource fields

Codebase file: `server/modules/providers/connections/radarrProvider.ts` (`RadarrMovie` interface,
lines 10–39). Normalization: `server/modules/media/normalizeMedia.ts:12-27`
(`normalizeRadarrMovie`). Domain shape: `server/modules/media/movie.ts` (`NormalizedMovie`).

| Radarr field | Wired? | Detail |
|---|---|---|
| `id` | wired | `radarrProvider.ts:11`, used as `_sourceIds.radarr` (`normalizeMedia.ts:14`) |
| `title` | wired | `radarrProvider.ts:12` → `NormalizedMovie.title`, filter rule `title` (`ruleRegistry.ts:123`) |
| `year` | wired | `radarrProvider.ts:13` → filter rule `year` (`ruleRegistry.ts:136`) |
| `hasFile` | wired | `radarrProvider.ts:14` → filter rule `hasFile` (`ruleRegistry.ts:222`) |
| `monitored` | **not-wired for movies** | `radarrProvider.ts:15` field exists on `RadarrMovie` and is copied in `normalizeMedia.ts:18` onto `NormalizedMovie.monitored`, but the `monitored` filter rule (`ruleRegistry.ts:296`) is **series-only** (`contentTypes: ['series']`, `providers: [SONARR]`) — Radarr populates the same-named domain field with no movie-side filter rule reading it. Layer: UI filter, query engine (movie-scoped rule needed) |
| `tmdbId` | wired | `radarrProvider.ts:16` → `_sourceIds.tmdb` (`normalizeMedia.ts:14`), identity matching |
| `imdbId` | wired | `radarrProvider.ts:17` → `_sourceIds.imdb` (`normalizeMedia.ts:14`) |
| `profileId` | not-wired | present on `RadarrMovie` (`radarrProvider.ts:18`) but never read anywhere else in the codebase — appears to be a legacy/duplicate of `qualityProfileId`. Layer: none needed if truly dead; flag for decision ticket |
| `qualityProfileId` | wired | `radarrProvider.ts:19` → filter rule `qualityProfileIds` (`ruleRegistry.ts:256`), also the `changeQualityProfile` task's target |
| `tags` | wired | `radarrProvider.ts:20` → `radarrTagsFieldSource` (`mediaFieldProvider.ts:61-63`) → filter rule `tagIds` (`ruleRegistry.ts:237`) |
| `folderName` | not-wired | `radarrProvider.ts:21`. Layer: provider field, UI filter (path/folder filter), query engine |
| `path` | not-wired | `radarrProvider.ts:22`. Same as `folderName` — full filesystem path. Layer: provider field, UI filter, query engine |
| `images` | not-wired | `radarrProvider.ts:23` (`RadarrImage[]`: `coverType`, `remoteUrl`). No poster/fanart display anywhere in the media pipeline today. Layer: provider field, UI (display, not filter) |
| `genres` | wired | `radarrProvider.ts:24` → filter rule `genres` (movie-only, `ruleRegistry.ts:269`) |
| `added` | wired, **naming collision — see §4** | `radarrProvider.ts:25` → `NormalizedMovie.addedDate` (`normalizeMedia.ts:22`) → filter rule `addedDaysAgo` (`ruleRegistry.ts:163`, shared across Radarr/Sonarr/Plex) |
| `certification` | wired | `radarrProvider.ts:26` → filter rule `certification` (`ruleRegistry.ts:204`, shared with Sonarr/TMDB/OMDB as declared-but-not-all-populated `providers`) |
| `ratings.imdb.value` | wired | `radarrProvider.ts:27-33` → `NormalizedMovie.imdbRating` (`normalizeMedia.ts:25`) → filter rule `imdbRating` (`ruleRegistry.ts:281`) |
| `ratings.imdb.votes` | not-wired | typed on `RadarrMovie` but vote count never extracted. Layer: provider field, UI filter, query engine |
| `ratings.tmdb.value`/`.votes` | not-wired | typed (`radarrProvider.ts:29`) but never read. `NormalizedMovie.tmdbRating` exists as a field name (`movie.ts:33`) but nothing populates it from Radarr (TMDB rating currently only reachable via the separate TMDB enricher's `tmdbStatus`, not a numeric rating). Layer: enrichment, UI filter, query engine — **note existing `tmdbRating` field on the domain type is itself currently orphaned/unpopulated from any source** |
| `ratings.metacritic.value`/`.votes` | not-wired | typed (`radarrProvider.ts:30`), never read. Layer: provider field, UI filter, query engine |
| `ratings.rottenTomatoes.value`/`.votes` | not-wired | typed (`radarrProvider.ts:31`), never read. Radarr can source RT scores when configured with a custom metadata agent; OMDB also returns RT scores (`docs/architecture/media-providers.md`'s OMDB section) — **two potential producers for one field name, flag for precedence ticket** |
| `ratings.trakt.value`/`.votes` | not-wired | typed (`radarrProvider.ts:32`), never read. Layer: provider field, UI filter, query engine |
| `statistics.movieFileCount` | not-wired | typed (`radarrProvider.ts:35`), never read. Layer: provider field, UI filter, query engine |
| `statistics.sizeOnDisk` | wired | `radarrProvider.ts:36` → `NormalizedMovie.sizeOnDiskBytes` (`normalizeMedia.ts:23`) → filter rule `sizeOnDiskGb` (`ruleRegistry.ts:192`) |
| `statistics.releaseGroups` | not-wired | typed (`radarrProvider.ts:37`), never read. Layer: provider field, UI filter, query engine |

### Movie fields Radarr's real API exposes that this codebase's `RadarrMovie` interface doesn't even type (confirmed via pycliarr/DeepWiki cross-reference against Radarr v3's actual `MovieResource`)

All of these are **fully not-wired** — no provider-field typing exists at all, so every layer
(db/config, provider field, UI filter, query engine, enrichment) would need to be touched:

- `originalTitle`, `originalLanguage`, `alternateTitles`, `secondaryYear`, `sortTitle`, `cleanTitle`,
  `titleSlug` — title variants/sort helpers
- `overview` — plot synopsis
- `status` (Radarr's own lifecycle enum: `tba`/`announced`/`inCinemas`/`released`/`deleted`) —
  **naming-collision risk**: `NormalizedSeries` already has a `status` field sourced from Sonarr
  with different semantics (series status: continuing/ended, not per-episode release lifecycle) —
  flag for precedence ticket if a movie `status` field is ever added
- `inCinemas`, `physicalRelease`, `digitalRelease` — release-date milestones, distinct from `added`
  and `year`
- `website`, `youTubeTrailerId` — external links
- `studio` — production studio/company
- `collection` (`{ name, tmdbId }` typically) — Radarr's movie-collection/franchise grouping
- `minimumAvailability` — Radarr's own download-gating enum (`announced`/`inCinemas`/`released`/`preDB`)
- `rootFolderPath` — distinct from `path`/`folderName` (already-typed but unwired above); this is
  the *configured* root, `path`/`folderName` are the *resolved* location
- `isAvailable` — computed availability flag
- `runtime` — movie length in minutes
- `addOptions` (`searchForMovie`, `monitor` mode, minimumAvailability-at-add) — only relevant to the
  *add* flow, not an existing-movie field; not applicable unless an "add movie to Radarr" task is
  ever built
- `alternateTitles` — see title variants above

## 2. Queue endpoint (`GET /api/v3/queue`)

Not wired at all — no code in this repo calls the queue endpoint. Fields (per Radarr docs/arrapi):
`id`, `movieId`, `title`, `size`, `sizeleft`, `timeleft`, `estimatedCompletionTime`, `status`,
`trackedDownloadStatus`, `trackedDownloadState`, `statusMessages`, `downloadId`, `protocol`,
`downloadClient`, `indexer`, `outputPath`, `quality`. Layer: this is a wholly new capability — would
touch provider field (new response type), UI (a "download queue" view is a different UI shape than
existing filters — not a per-movie filter, it's queue-level state), and possibly automation
(e.g., "remove stalled download" as a task). No existing analog in this codebase for any provider.

## 3. History endpoint (`GET /api/v3/history`, `/history/movie`)

Not wired at all. Fields (per Radarr docs/arrapi): `id`, `movieId`, `sourceTitle`, `quality`,
`qualityCutoffNotMet`, `date`, `downloadId`, `eventType` (`grabbed`/`downloadFolderImported`/
`downloadFailed`/`movieFileDeleted`/`movieFileRenamed`/`movieFolderImported`), `data` (event-specific
payload), embedded `movie`. Distinct capability from Tautulli's watch-history (Radarr's history is
*acquisition* history — grabs/imports/failures — not playback history); **naming-collision risk**:
if a `history`-shaped field or filter is ever added for Radarr, it must not collide conceptually
with Tautulli's `lastWatchedAt`/watch-history despite both being "history." Layer: provider field,
UI (event-log style view, not a filter predicate), enrichment (if surfaced onto `MediaItem`).

## 4. `added` field — naming-collision flag (explicit, per ticket instruction)

Two fields named similarly across providers carry **different meanings** and must not be conflated
when the precedence ticket resolves cross-provider field names:

- **Radarr's `added`** (`radarrProvider.ts:25`, → `NormalizedMovie.addedDate`,
  `ruleRegistry.ts:163` `addedDaysAgo` rule): **addedAt-to-source** — the timestamp Radarr itself
  added the movie to *its own* database/catalog. This is a source-system bookkeeping timestamp, not
  a user-facing "when did I get this" timestamp. Shared filter rule `addedDaysAgo` currently lists
  `providers: [RADARR, SONARR, PLEX]` — meaning Plex's own `addedDate` contribution (if any)
  and Radarr's are treated as the same rule today (see next point).
- **Plex's `plexAddedAt`** (`plexProvider.ts` — sourced from Plex's `addedAt` field on library items,
  wired via `plexEnricher`/`plexFieldProvider`, `docs/architecture/media-providers.md` line 102-104):
  **addedAt-to-library** — the timestamp the item entered the *Plex library* (i.e., when Plex's
  scanner picked it up), which normally lags Radarr's `added` by however long the download/import
  took. This is already wired as a **separate** filter rule, `plexAddedDaysAgo`
  (`ruleRegistry.ts:179`, `sourceField: 'plexAddedAt'`, single-producer, no precedence entry) —
  the codebase already keeps these two timestamps distinct as two different rules/fields
  (`addedDate` vs `plexAddedAt`), which is the correct disambiguation, but the *generic* rule name
  `addedDaysAgo` (fed by Radarr **and** Sonarr **and** Plex per its `providers` list) invites
  confusion: Plex's actual library-native `addedAt` already has its own dedicated rule
  (`plexAddedDaysAgo`), so what is Plex contributing to the shared `addedDaysAgo` rule today?
  **Verify in decision ticket**: grep shows `plexAddedDaysAgo`'s `providers` derives from
  `plexAddedAt` only (`deriveProviders('plexAddedAt')`), while `addedDaysAgo`'s
  `providers` is hand-listed as `[RADARR, SONARR, PLEX]` (`ruleRegistry.ts:167-171`) even
  though no code path shows Plex populating `NormalizedMovie.addedDate`/`addedDate` — this looks like
  a **stale/incorrect `providers` listing**, not a live third meaning of "added." Flag for the
  decision ticket, not resolved here.

## 5. Actuator tasks / commands

Codebase: `server/modules/providers/connections/radarrProvider.ts:65-127` (`tasks()`), pattern
reference `server/modules/providers/connections/plexProvider.ts:30-61`.

| Task id (this codebase) | Status | Radarr API call |
|---|---|---|
| `unmonitorMovie` | wired, real | `radarrProvider.ts:68-73`, `unmonitorMovies()` (PUT `movie/{id}`, `monitored: false`) |
| `triggerSearch` | wired, real | `radarrProvider.ts:74-79`, `triggerMoviesSearch()` (POST `command`, `name: 'MoviesSearch'`) |
| `deleteMovieWithFiles` | wired, real | `radarrProvider.ts:80-86`, `deleteMovies()` (DELETE `movie/{id}`, `deleteFiles=true`) |
| `deleteMovieKeepFiles` | **declared, modelled-only** | `radarrProvider.ts:87-93`, `modelledRun('deleteMovieKeepFiles')` — rejects on invocation (`roles.ts:64-66`). **This is the one task still matching the doc's "reject on invocation" description.** |
| `changeQualityProfile` | wired, real — **doc is stale here** | `radarrProvider.ts:94-105`, calls real `changeQualityProfile()` (PUT `movie/editor`). `docs/architecture/media-providers.md:33-34` currently lists this as "modelled-only" alongside `deleteMovieKeepFiles`/`addTag`/`removeTag` — **that line is now inaccurate**, this task is implemented against Radarr's real API (bulk `movie/editor` endpoint) |
| `addTag` | wired, real — **doc is stale here** | `radarrProvider.ts:106-113`, calls real `applyTag()` (PUT `movie/editor`, `applyTags: 'add'`). Same staleness as `changeQualityProfile` — doc says modelled-only, code is real |
| `removeTag` | wired, real — **doc is stale here** | `radarrProvider.ts:114-125`, calls real `applyTag()` (PUT `movie/editor`, `applyTags: 'remove'`). Same staleness |

**`modelledRun` status update for the ticket's "known gap to verify":** the map/ticket's inherited
context ("`modelledRun` documented as reject-on-invocation, not yet implemented") is **now only true
for `deleteMovieKeepFiles`**. `changeQualityProfile`, `addTag`, and `removeTag` have all moved to real
implementations since `docs/architecture/media-providers.md` was last written — that doc (lines
33-34) needs correction as part of doc lifecycle hygiene, separate from this spec effort. Flagging
here per this ticket's scope; not fixing the doc myself since that's a `docs/architecture/` edit
outside this ticket's remit and the map instructs not to touch anything but this ticket/asset.

### Radarr commands/actions not exposed as tasks at all (candidate tasks, fully not-wired)

Cross-referenced against Radarr's `NzbDrone.Core/Movies/Commands/` directory (confirmed via GitHub:
`BulkMoveMovieCommand.cs`, `MoveMovieCommand.cs`, `RefreshCollectionsCommand.cs`,
`RefreshMovieCommand.cs` — the last read directly, confirms `MovieIds: number[]`,
`IsNewMovie: boolean` shape) plus the wider command vocabulary documented across Radarr/arrapi/
community docs:

- **`RefreshMovie`** — re-pull metadata for existing movie(s) from Radarr's own metadata source
  (distinct from re-searching for a download). Confirmed real command class in Radarr's source.
  Layer: task/actuator, automation.
- **`RescanMovie`** — rescan the movie's folder on disk for files Radarr hasn't indexed yet (distinct
  from `RefreshMovie`'s metadata pull and from `triggerSearch`'s indexer search). Layer:
  task/actuator, automation.
- **`RenameMovies`** — apply the configured naming scheme to already-imported files. Layer:
  task/actuator, automation.
- **`MoveMovieCommand`/`BulkMoveMovieCommand`** — move a movie (or many) to a different root
  folder/path. Confirmed real command classes. This is the "root-folder move" action named in the
  ticket's known-context list — **not wired**, no equivalent task exists today. Layer: provider
  field (needs root-folder list, already available via `getRootFolders()` — wired but unused for
  this purpose), task/actuator, automation.
- **`RefreshCollectionsCommand`** — refresh Radarr's movie-collection metadata. Confirmed real
  command class. Only relevant if `collection` (§1) is ever wired as a field. Layer: task/actuator.
- **`MissingMoviesSearch`** — search for all monitored-but-missing movies in bulk (library-wide,
  not per-selection like `triggerSearch`/`MoviesSearch`). Layer: task/actuator, automation
  (different selection semantics from existing per-item tasks — flag for decision ticket, not a
  simple field/task like the others).
- **`DownloadedMoviesScan`** — scan a specific downloaded-files folder for import (manual-import
  trigger). Layer: task/actuator.
- Quality-profile change and tag add/remove are **already wired** (see table above) — listed in the
  ticket's known-context as candidates but confirmed present, not a gap.
- Delete-with-files and delete-keep-files are **already declared** (one real, one modelled-only per
  above) — not new gaps, just the existing `deleteMovieKeepFiles` completion gap already flagged.

## 6. Structural schema-change flags

- **None identified that require a new column/table beyond what already exists.** The
  `media_enrichment` EAV table (`server/database/schema.ts:309-325`, added in commit `855d514`)
  already provides a sparse, provider-agnostic slot for any new scalar field (number/string/boolean)
  without a migration — genres/studio/collection/ratings/statistics fields above are all
  representable as `EnrichmentFields` additions plus `media_enrichment` rows, not schema changes.
- **Possible exception, flagged not designed:** the **queue** (§2) and **history** (§3) endpoints are
  not per-movie scalar facts — they're collections (a movie can have N queue entries over time, N
  history events). Representing these as `media_enrichment` rows (one fact per identity+field) does
  not fit a 1:N shape. If either is ever wired, it likely needs its own table (e.g.
  `radarr_queue_item`/`radarr_history_event`), not an `EnrichmentFields` key. Flagging for the
  decision ticket to evaluate — not resolving here.
- **`collection`** (§1) is itself a nested object (`{ name, tmdbId }`), not a scalar — if wired, needs
  a design decision on whether it flattens to a `collectionName`/`collectionTmdbId` pair of scalar
  `EnrichmentFields` (fits EAV) or needs relational modeling (e.g. querying "all movies in a given
  collection" as a first-class join) — flagged, not resolved.
