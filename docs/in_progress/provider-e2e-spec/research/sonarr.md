# Sonarr — API surface audit

Research asset for `docs/in_progress/provider-e2e-spec/tickets/04-sonarr-research.md`. Enumerates
Sonarr's v3 API surface against what this codebase currently wires. Enumeration only — no curation,
no collision resolution.

Sources: `server/modules/providers/connections/sonarrProvider.ts`,
`server/modules/media/{mediaFieldProvider,normalizeMedia,show,ruleRegistry,activeFieldSet}.ts`,
`server/modules/media/enrichment/{enricherAdapters,precedence}.ts`,
`server/modules/providers/{providerFactory,roles}.ts`, `src/lib/provider-registry.ts`; Sonarr v3
API docs (sonarr.tv/docs/api, Sonarr GitHub wiki, `golift.io/starr/sonarr`, `pyarr` literals — the
live Swagger spec requires a running instance and wasn't directly fetchable, so field/command names
are cross-checked across three independent client-library sources).

## Series resource fields

| Field | Status | Notes |
|---|---|---|
| `id` | wired | `sonarrProvider.ts:16`, used as `_sourceIds.sonarr` (`normalizeMedia.ts:31`) |
| `title` | wired | `normalizeMedia.ts:33` → `NormalizedSeries.title`, filter rule `title` (`ruleRegistry.ts:123`) |
| `year` | wired | `normalizeMedia.ts:34` → filter rule `year` (`ruleRegistry.ts:136`) |
| `status` | wired | `normalizeMedia.ts:43` → filter rule `seriesStatus` (`ruleRegistry.ts:305`) |
| `monitored` | wired | `normalizeMedia.ts:34` → filter rule `monitored` (`ruleRegistry.ts:296`) |
| `tvdbId` | wired | `_sourceIds.tvdb` (`normalizeMedia.ts:31`, `series.ts:13`) — not itself filterable |
| `tmdbId` | wired | `_sourceIds.tmdb` (`normalizeMedia.ts:31`) — cross-provider join key |
| `imdbId` | **not wired** | `SonarrSeries` has no `imdbId` field at all — not read from the API response, not carried anywhere. Touches: provider field (add to `SonarrSeries`/`normalizeSonarrSeries`), possibly `_sourceIds.imdb` (schema already has `imdb` on `NormalizedMovie`'s `_sourceIds`, absent from `NormalizedSeries`'s) |
| `tvMazeId` | **not wired** | Present on `SonarrSeries` type (`sonarrProvider.ts:24`) but never read in `normalizeSonarrSeries`. Touches: provider field mapping only (type already declares it) |
| `profileId` | **not wired** | Declared on `SonarrSeries` (`sonarrProvider.ts:25`, legacy v2 field, superseded by `qualityProfileId`) but unused. Low value — likely dead field from the Sonarr API itself. |
| `qualityProfileId` | wired | `normalizeMedia.ts:35` → filter rule `qualityProfileIds` (`ruleRegistry.ts:333`), instance-scoped |
| `languageProfileId` | **not wired** | Declared on `SonarrSeries` (`sonarrProvider.ts:27`) but never read. Touches: provider field, UI filter (language profile picker analogous to quality profile), query engine, task (a `changeLanguageProfile` task doesn't exist — see Tasks section) |
| `tags` | wired | `sonarrTagsFieldSource` (`mediaFieldProvider.ts:65-67`) → filter rule `tagIds` (`ruleRegistry.ts:317`), instance-scoped. Enrichment-shaped (`EnrichmentFields.tags`) even though it's populated at normalize-time, not via a `MediaEnricher` |
| `path` | **not wired** | Declared on `SonarrSeries` (`sonarrProvider.ts:29`) but never read. Touches: provider field, UI filter (path/root-folder filter), possibly query engine |
| `seasons` (array: `seasonNumber`, `monitored`) | **not wired** | Full per-season structure declared (`sonarrProvider.ts:5-8`) but never read in `normalizeSonarrSeries` — only aggregate `statistics` counts are used. Touches: **structural schema change** if per-season data is to be queryable/filterable (a show currently normalizes to one flat row; per-season monitoring would need a child table or JSON column beyond `settings`) |
| `images` | **not wired** | Declared (`sonarrProvider.ts:31`, `SonarrImage`: `coverType`, `remoteUrl`) but never read. Touches: provider field, UI (poster/fanart display) — not a filter/query concern |
| `genres` | wired | `normalizeMedia.ts:37` → filter rule `genres` (`ruleRegistry.ts:346`), shared with TMDB as a producer |
| `network` | wired | `normalizeMedia.ts:42` → filter rule `network` (`ruleRegistry.ts:370`), shared with TVMaze as a producer. **Naming collision candidate** — see below |
| `seriesType` | wired | `normalizeMedia.ts:41` → filter rule `seriesType` (`ruleRegistry.ts:358`), enum `'standard' \| 'daily' \| 'anime'` (`series.ts:28`) |
| `added` | wired | `normalizeMedia.ts:38` → `NormalizedSeries.addedDate` → filter rule `addedDaysAgo` (`ruleRegistry.ts:163`). **Naming collision — flagged explicitly below** |
| `ended` | wired | `normalizeMedia.ts:44` → filter rule `ended` (`ruleRegistry.ts:396`) |
| `previousAiring` | wired | `normalizeMedia.ts:46` → `NormalizedSeries.lastAiredAt` → filter rule `lastAiredDaysAgo` (`ruleRegistry.ts:408`) |
| `nextAiring` | **not wired** | Sonarr's API exposes `nextAiring` alongside `previousAiring`; this codebase only reads `previousAiring`. Touches: provider field, UI filter ("next episode in N days"), query engine |
| `certification` | wired | `normalizeMedia.ts:40` → filter rule `certification` (`ruleRegistry.ts:204`), shared across Radarr/Sonarr/TMDB/OMDB |
| `ratings` (`votes`, `value`) | partially wired | `.value` → `normalizeMedia.ts:47` → `NormalizedSeries.communityRating` → filter rule `communityRating` (`ruleRegistry.ts:383`). `.votes` **not wired** — no vote-count filter/field exists. Touches (votes): provider field, UI filter, query engine |
| `statistics.seasonCount` | **not wired** | Declared on `SonarrSeries.statistics` (`sonarrProvider.ts:41`) but not read into `NormalizedSeries`. Touches: provider field, UI filter, query engine |
| `statistics.episodeFileCount` | **not wired** | Same as above |
| `statistics.episodeCount` | **not wired** | Same as above |
| `statistics.totalEpisodeCount` | **not wired** | Same as above |
| `statistics.sizeOnDisk` | wired | `normalizeMedia.ts:39` → `sizeOnDiskBytes` → filter rule `sizeOnDiskGb` (`ruleRegistry.ts:192`), shared with Radarr |
| `statistics.percentOfEpisodes` | wired | `normalizeMedia.ts:45` → `episodePercentage` → filter rule `episodePercentage` (`ruleRegistry.ts:421`) |
| `hasFile` (derived) | wired-but-source-mismatch | Filter rule `hasFile` (`ruleRegistry.ts:222`) lists Sonarr as a `providers` entry, but Sonarr's `SonarrSeries`/`NormalizedSeries` has no `hasFile` field at all (Radarr's `hasFile` is a direct API field; Sonarr has no per-series equivalent — only per-episode file presence). **This looks like a latent bug**: the rule's predicate reads `item.hasFile`, which is always `undefined` for Sonarr-sourced shows, so the `hasFile` filter silently never matches a show. Flagging per the ticket's "flag, don't design" scope; not fixing here. |

## Sonarr-owned Profile/Tag/RootFolder lookups (used for filter option population, not series fields)

| Endpoint | Status | Notes |
|---|---|---|
| `qualityprofile` (`getProfiles`) | wired | `sonarrProvider.ts:142-146`, backs the instance-scoped `qualityProfileIds` filter's option list |
| `rootfolder` (`getRootFolders`) | **not wired to any filter/task** | Fetched (`sonarrProvider.ts:148-152`) but nothing in ruleRegistry/tasks consumes it. Touches: UI filter (root-folder scoping), possibly a `changeRootFolder` task |
| `tag` (`getTags`) | wired | `sonarrProvider.ts:154-156`, backs `addTag`/`removeTag` task parameter and the `tagIds` filter's option list |
| `series/lookup` (`lookupSeries`) | wired, but only for add-series flows | Not part of the filter/task/enrichment spec surface — used elsewhere (e.g. add-provider UI), out of scope here |
| `languageprofile` | **not wired** | No `getLanguageProfiles()` method exists on `SonarrProvider` at all, unlike `qualityprofile`/`tag`/`rootfolder`. Touches: provider field (new fetch method), UI filter, task (`changeLanguageProfile`) |

## Tasks / MediaActuator (`sonarrProvider.ts:74-136`)

Compared against `RadarrProvider.tasks()` (`radarrProvider.ts:65-127`) and `PlexProvider.tasks()`
(`plexProvider.ts:30-61`). Sonarr's task list is structurally parallel to Radarr's (both are
`MediaSource`-owning actuators with the same six-task shape), which is the expected pattern per
`roles.ts`'s `SOURCE_OWNER`.

| Task | Status | Notes |
|---|---|---|
| `unmonitorSeries` | wired | `sonarrProvider.ts:77-81`, real PUT `series/{id}` |
| `triggerSearch` (→ `SeriesSearch` command) | wired | `sonarrProvider.ts:84-88` |
| `deleteSeriesWithFiles` | wired | `sonarrProvider.ts:90-95`, real DELETE |
| `deleteSeriesKeepFiles` | **modelled, not implemented** | `sonarrProvider.ts:97-102`, uses `modelledRun('deleteSeriesKeepFiles')` — rejects on invocation. **This is the direct Sonarr analog of Radarr's `deleteMovieKeepFiles` gap** (`radarrProvider.ts:88-93`, same `modelledRun` pattern). Not a Sonarr-specific gap — a shared, already-known gap class across both `MediaSource` actuators. The real Sonarr DELETE call (`deleteSeries`, `sonarrProvider.ts:210-224`) hardcodes `deleteFiles: 'true'`, so a real "keep files" variant needs a second DELETE call shape (`deleteFiles: 'false'`), not just unblocking the modelled stub. |
| `changeQualityProfile` | wired | `sonarrProvider.ts:104-114`, PUT `series/editor` |
| `addTag` / `removeTag` | wired | `sonarrProvider.ts:116-134`, PUT `series/editor` |
| `changeLanguageProfile` | **not wired, no task at all** (not even modelled) | Sonarr v3's `languageProfileId` is a real per-series field (see above) but has no corresponding task, unlike quality profile which gets a full task. Touches: task/actuator (new task + `PUT series/editor` with `languageProfileId`), UI filter/automation parameter (language profile picker), provider field (`getLanguageProfiles()` fetch method doesn't exist yet either) |
| `changeRootFolder` | **not wired, no task at all** | Root folders are fetched (`getRootFolders`) but never used in a task. Radarr has the identical gap — not Sonarr-specific. Touches: task/actuator, automation parameter |
| `RescanSeries` (command) | **not wired** | Distinct from `RefreshSeries`/`triggerSearch`'s `SeriesSearch` — rescans disk for existing files without searching for new ones. Touches: task/actuator |
| `RefreshSeries` (command) | **not wired** | Refreshes series metadata from the indexer (TheTVDB) without touching disk. Distinct from `RescanSeries`. Touches: task/actuator |
| `EpisodeSearch` (command) | **not wired** | Per-episode search, finer-grained than `SeriesSearch`. Touches: task/actuator — would need an episode-level id space, which this codebase's `ActuatorTargetId` (series-level number) doesn't currently support for Sonarr. Possible **structural gap**: episode-level targeting isn't representable in the current series-row-per-item model without a child entity. |
| `SeasonSearch` (command) | **not wired** | Per-season search. Same season-level-targeting gap as `EpisodeSearch` — the current model has no season-level id space either. |
| `RenameSeries` (command) | **not wired** | Renames series folder/files to the configured naming format. Touches: task/actuator |
| `RenameFiles` (command) | **not wired** | Finer-grained than `RenameSeries` — renames specific file ids. Touches: task/actuator, and needs a file-id addressing space this codebase doesn't have for Sonarr. |
| `MissingEpisodeSearch` (command) | **not wired** | Searches for all missing/monitored-but-missing episodes across the instance (not scoped to one series). Touches: task/actuator — this is instance-scoped rather than item-scoped, which doesn't fit `ActuatorTask.run(ids)`'s per-item shape; likely needs a different task kind or an "all series" sentinel. |
| `RssSync` (command) | **not wired** | Instance-level (not series-scoped) — triggers an RSS sync across all indexers. Same instance-vs-item-scope mismatch as `MissingEpisodeSearch`. |
| `Backup` (command) | **not wired** | Instance-level, unrelated to media items — out of the `MediaActuator` per-item task shape entirely. Likely out of scope for this spec track. |
| `DownloadedEpisodesScan` (command) | **not wired** | Scans a specific downloaded folder for import — parameterized differently (path, not series ids). Touches: task/actuator, but doesn't fit the `ids: ActuatorTargetId[]` task shape without a path parameter type this codebase's `ActuatorTaskParameter` (single-select id) doesn't support. |
| Queue endpoint (`GET queue`) | **not wired** | No queue/download-progress surface exists for Sonarr (or Radarr) in this codebase at all. Touches: db/config (if persisted), provider field, UI (a "download queue" view is a different UI shape than the filter/task model), possibly a new query-engine concept entirely — **flag as spec-shape question**, not a simple field/task gap. |
| History endpoint (`GET history`) | **not wired** | Same shape as queue — grab/import/failed event history per series/episode. No representation anywhere in ruleRegistry or enrichment. Touches: same open question as queue above. |

## Naming-collision flags (not resolved here — for `specs/_precedence.md`)

1. **`added` / `addedDate`.** Sonarr's `added` (`sonarrProvider.ts:35`) is *addedAt-to-source* — the
   timestamp the series was added to Sonarr's own catalog. It flows into the shared
   `addedDaysAgo` filter rule (`ruleRegistry.ts:163`) alongside Radarr's `added` (same
   addedAt-to-source meaning) and **Plex's `plexAddedAt`** (`mediaFieldProvider.ts:151`,
   `plexFieldProvider`), which is *addedAt-to-library* — a materially different event (a file
   landing in the Plex library, not a series being tracked in Sonarr). The two are already kept
   in **separate filter rules** today (`addedDaysAgo` vs `plexAddedDaysAgo`,
   `ruleRegistry.ts:163` and `:179`), so this specific collision is already resolved in the
   current schema — flagging only because the ticket's "known context" explicitly calls out this
   exact pair (Plex `added` = downloadedAt-to-library vs Radarr/Sonarr `added` =
   addedAt-to-source) as the canonical example, and it's worth the precedence ticket confirming
   the existing `addedDaysAgo`/`plexAddedDaysAgo` split is the intended permanent resolution
   rather than an accident of build order.
2. **`network`.** Sonarr's `network` (`sonarrProvider.ts:33`) and TVMaze's `network` both feed the
   same `network` filter rule (`ruleRegistry.ts:370`, `providers: [SONARR, TVMAZE]`).
   Sonarr's is the current-network-per-TheTVDB-record; TVMaze's own network field can differ
   (TVMaze tracks streaming-service moves more granularly, including `webChannel` as a *separate*
   field from `network` — see below). Not resolved here; flag for precedence ticket.
3. **`webChannel` (TVMaze) vs `network` (Sonarr) — potential future collision, not a same-name
   collision today.** Out of scope for this ticket (TVMaze's own research ticket owns it) but
   noting here because it bears on Sonarr's `network` field's precedence once TVMaze is audited.
4. **`certification`.** Shared verbatim key across Radarr, Sonarr, TMDB, and OMDB
   (`ruleRegistry.ts:204`) — different providers may format certification strings differently
   (e.g. `"TV-14"` vs MPAA `"PG-13"` vs country-prefixed OMDB ratings). Not a *name* collision (all
   four use the same field name by design) but a **value-format** collision risk worth flagging
   for the precedence ticket since the predicate does a case-insensitive exact string match with
   no normalization.
5. **`tags`.** Both Radarr and Sonarr produce a `tags: number[]` field with identical shape
   (`mediaFieldProvider.ts:59-67`) but the ids live in **separate id spaces** per instance (a
   Radarr tag id 3 and a Sonarr tag id 3 are unrelated) — already handled by `instanceScoped: true`
   on both `tagIds` rules (`ruleRegistry.ts:249`, `:326`) and by keeping them as two
   content-type-scoped rules rather than one derived rule (see the code comment at
   `ruleRegistry.ts:241-245`). Flagging only as a pattern precedent — the same instance-scoping
   treatment should apply to `qualityProfileIds` and any new `languageProfileId`/`rootFolder`
   filters if built.

## Structural schema-change gaps (flagged, not designed)

- **Per-season data** (`seasons[]`: `seasonNumber`, `monitored`) — the current model normalizes a
  series to one flat row; representing per-season monitor state, per-season file counts, or a
  per-season filter/task ("unmonitor season 3") needs a child table, not a `settings` JSON value.
- **Episode-level and season-level task targeting** (`EpisodeSearch`, `SeasonSearch`,
  `RenameFiles`) — `ActuatorTargetId` is `number | string` addressed at the series/movie/library-item
  level throughout (`roles.ts:34`); episode and season ids are a different, nested addressing space
  the current `MediaActuator`/`ActuatorTask` shape has no slot for.
- **Instance-scoped (non-item) commands** (`MissingEpisodeSearch`, `RssSync`, `Backup`,
  `DownloadedEpisodesScan`) — every existing task is `run(ids, parameterValue)`, i.e. always scoped
  to a set of media items. These four commands operate on the whole Sonarr instance with no item
  scope at all, which doesn't fit the current `ActuatorTask` interface without either a sentinel
  "no ids" convention or a new non-item task kind.
- **Queue and history surfaces** — no existing db/config, provider-field, or query-engine concept
  represents an in-progress download or a historical grab/import/failure event; this is a different
  data shape (event stream / progress state) than the flat `NormalizedSeries` row the rest of the spec
  assumes. Likely needs its own structural design, not a field addition.
- **`imdbId` / `_sourceIds.imdb` on shows** — `NormalizedMovie._sourceIds` already has `imdb`, but
  `NormalizedSeries._sourceIds` (`series.ts:8-18`) does not, even though Sonarr's API does expose
  `imdbId`. Adding it is schema-shaped (new optional field on an existing interface) rather than a
  new table/column — flagging as the smaller sibling of the structural gaps above, not equivalent
  severity.

## Counts

- Newly-found, not-yet-wired series/lookup fields: **16** (`imdbId`, `tvMazeId`, `languageProfileId`,
  `path`, `seasons[]`, `images[]`, `nextAiring`, `ratings.votes`, `statistics.seasonCount`,
  `statistics.episodeFileCount`, `statistics.episodeCount`, `statistics.totalEpisodeCount`,
  `rootfolder` list unused by any filter/task, `languageprofile` endpoint absent entirely, plus the
  `hasFile` latent-bug entry and `profileId` legacy-field entry noted for completeness)
- Newly-found, not-yet-wired tasks/commands: **12** (`changeLanguageProfile`, `changeRootFolder`,
  `RescanSeries`, `RefreshSeries`, `EpisodeSearch`, `SeasonSearch`, `RenameSeries`, `RenameFiles`,
  `MissingEpisodeSearch`, `RssSync`, `Backup`, `DownloadedEpisodesScan`) plus queue/history as two
  structural (non-task) surfaces
