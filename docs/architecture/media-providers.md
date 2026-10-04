# Media provider catalog

A ground-truth catalog of every external system this app can talk to, one entry per
`MetadataProviderType` ([`server/database/schema.ts`](ref:path:server/database/schema.ts)). For each:
what it is, which role(s) it plays in the shipped role model
([`docs/architecture/provider-roles-and-identity.md`](ref:path:docs/architecture/provider-roles-and-identity.md),
[`media-enricher-role.md`](ref:path:docs/architecture/media-enricher-role.md),
[`actuator-task-ownership.md`](ref:path:docs/architecture/actuator-task-ownership.md)), what its connection
class actually implements today, and whether that capability is wired into the media-item pipeline
(`MediaEnricher`/filter gating) or just sits unused. This is a survey of what exists, not a design — see
the closing note for how it relates to
[`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md).

Every provider authenticates via the single `apiKey` column on `metadata_provider`
([`server/database/schema.ts`](ref:path:server/database/schema.ts)) — a per-instance credential string,
never printed here. There is no OAuth flow anywhere in `providers/connections/`; "auth" below just names
what that string represents for the given system (API key, access token) and, for TVMaze, that there is
none.

## Radarr

**What it is:** movie library manager/downloader — the movie catalog owner.

**Role:** `MediaSource` (movie) + `MediaActuator`. Per `SOURCE_OWNER`
([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts)), Radarr is the sole
owner of the movie catalog; any number of active instances may run at once.

**Auth:** API key (`?apikey=` query param).

**What the app can pull today** ([`connections/radarrProvider.ts`](ref:path:server/modules/providers/connections/radarrProvider.ts)):
`getMovies()`, `getProfiles()`, `getRootFolders()`, `getTags()`, `lookupMovies(term)`. Every actuator
task is real (calls Radarr's API): `unmonitorMovies()`, `triggerMoviesSearch()`, `deleteMovies()`,
`deleteMoviesKeepFiles()`, `changeQualityProfile()`, `applyTag()` (add/remove), `refreshMovies()`,
`rescanMovies()`, `renameMovies()`, `refreshCollections()` (the last is instance-wide — Radarr's
`RefreshCollections` command has no per-movie scope, so its task ignores the selected ids and fires
once). None are modelled-only.

**Wired into the media-item pipeline?** Yes — as `MediaSource`. Radarr's own fields (`genres`,
`imdbRating`, `tags`, `qualityProfileId`, `certification`, `movieFileCount`, `releaseGroups`,
`inCinemasDate`, `physicalReleaseDate`, `digitalReleaseDate`, `collectionName`, `isAvailable`,
`radarrStatus`, etc.) are normalized directly onto `NormalizedMovie` by
[`normalizeMedia.ts`](ref:path:server/modules/media/normalizeMedia.ts) and gated straight into
`ruleRegistry.ts` — no enrichment step needed for source-owned data.

## Sonarr

**What it is:** TV series library manager/downloader — the series catalog owner.

**Role:** `MediaSource` (series) + `MediaActuator`, symmetric to Radarr.

**Auth:** API key (`?apikey=` query param).

**What the app can pull today** ([`connections/sonarrProvider.ts`](ref:path:server/modules/providers/connections/sonarrProvider.ts)):
`getSeries()`, `getProfiles()`, `getLanguageProfiles()`, `getRootFolders()`, `getTags()`,
`lookupSeries(term)`. Every actuator task is real (calls Sonarr's API): `unmonitorSeries()`,
`triggerSeriesSearch()`, `deleteSeries()`, `deleteSeriesKeepFiles()`, `changeQualityProfile()`,
`applyTag()` (add/remove), `refreshSeries()`, `rescanSeries()`, `renameSeries()`. None are
modelled-only. `moveSeries` and `changeLanguageProfile` are deliberately not built as tasks — their
automation-UI parameter shape (target root folder; target language profile id) is deferred to
[`docs/in_progress/provider-e2e-spec/tickets/11-automation-task-parameters.md`](ref:path:docs/in_progress/provider-e2e-spec/tickets/11-automation-task-parameters.md),
same precedent as Radarr's `moveMovie`.

**Wired into the media-item pipeline?** Yes — as `MediaSource`. Sonarr's fields (`genres`, `network`,
`seriesType`, `communityRating`, `episodePercentage`, `lastAiredAt`, `hasFile` (derived from
`statistics.episodeFileCount > 0`), `path`, `images`, `nextAiring`, `seasonCount`, `episodeFileCount`,
`episodeCount`/`totalEpisodeCount`, `languageProfileId`, etc.) normalize onto `NormalizedSeries`
([`normalizeMedia.ts`](ref:path:server/modules/media/normalizeMedia.ts)) and are gated directly into
`ruleRegistry.ts`. `_sourceIds.imdb`/`_sourceIds.tvmaze` are also populated (identity fields, not
enrichment data), closing the asymmetry with `NormalizedMovie._sourceIds.imdb`. Language profiles are a
Sonarr-only concept with no Radarr equivalent — `getLanguageProfiles()` backs the `languageProfileIds`
filter rule and the `GET /api/media/language-profiles` lookup route, both independent of the
not-yet-built `changeLanguageProfile` task.

## Tautulli

**What it is:** Plex watch-history/statistics tracker.

**Role:** `MediaEnricher` + `MediaActuator`.

**Auth:** API key (`?apikey=` query param, plus a `cmd=` command dispatch through a single `api/v2`
endpoint).

**What the app can pull today** ([`connections/tautulliProvider.ts`](ref:path:server/modules/providers/connections/tautulliProvider.ts)):
`getLibraryStats()`, `getHomeStats()`, `getHistory()`, `searchHistory(title)`. Actuator tasks
(`deleteWatchHistory`, `sendNotification`, `terminateStream`) are all modelled-only — declared, not
implemented against Tautulli's API.

**Wired into the media-item pipeline?** Yes — `tautulliEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getHistory()`, runs it through `tautulliFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts),
see [`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md))
into `playCount`/`lastWatchedAt` keyed by `plexRatingKey`, and wins precedence over Plex for both
fields in `contestedFieldPrecedence`. Gated into `ruleRegistry.ts` (`watched`, `lastWatchedDaysAgo`).

## Plex

**What it is:** media server — the thing users actually watch on.

**Role:** `MediaEnricher` + `MediaActuator`. Explicitly *not* `MediaSource` today — "media servers cannot
own" is a documented limitation in `provider-roles-and-identity.md`; Plex only enriches Radarr/Sonarr-owned
items by shared `tmdbId`/`tvdbId`/`plexRatingKey`.

**Auth:** access token (`X-Plex-Token` header). Separate token validation against `plex.tv` lives in
`PlexService`, not this connection class.

**What the app can pull today** ([`connections/plexProvider.ts`](ref:path:server/modules/providers/connections/plexProvider.ts)):
`getLibraries()`, `getLibraryContents(libraryKey)`, `getAllItems()` (flattens every library). Actuator
tasks (`deleteFromLibrary`, `moveToTrash`, `refreshMetadata`, `markPlayed`, `markUnplayed`) are all
modelled-only.

**Wired into the media-item pipeline?** Yes — `plexEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getAllItems()`, runs it through `plexFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts)) into `playCount`/
`lastWatchedAt` keyed by `ratingKey`, loses precedence to Tautulli when both are configured. Also
contributes `plexAddedAt` (Plex's own library-added timestamp, ISO-converted from `addedAt`) —
single-producer, no precedence entry, gated into `ruleRegistry.ts` as `plexAddedDaysAgo`. Also
stamped onto `media_identity` groups by the identity job (`runForPlex`) for `plexRatingKey` matching —
never inserts a group of its own.

## Jellyfin

**What it is:** alternative media server (Plex analog).

**Role:** `MediaEnricher` + `MediaActuator`. Explicitly *not* `MediaSource`, same "media servers cannot
own" limitation as Plex — Jellyfin only enriches Radarr/Sonarr-owned items, matched by
`_sourceIds.jellyfin` (populated by the identity job's `runForJellyfin` stamping pass, matching by
`kind` + `tmdbId`/`tvdbId`, mirroring `runForPlex`).

**Auth:** access token (`X-Emby-Authorization` header) plus a configured `userId` setting (today's model —
one Jellyfin user per configured instance, not full multi-user).

**What the app can pull today** ([`connections/jellyfinProvider.ts`](ref:path:server/modules/providers/connections/jellyfinProvider.ts)):
`getLibraries()`, `getLibraryContents(libraryId)`, `getAllItems()` (user-scoped `Users/{userId}/Items`,
so the response carries per-user `UserData` — `IsFavorite`/`PlayCount`/`LastPlayedDate`/`Played`).
Actuator tasks (`deleteItem`, `refreshMetadata`, `markPlayed`, `markUnplayed`, `addToCollection`,
`removeFromCollection`) are all real, bound to Jellyfin's API.

**Wired into the media-item pipeline?** Yes — `jellyfinEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getAllItems()`, runs it through `jellyfinFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts)) into `playCount`/
`lastWatchedAt` (synthesized from `Played` when `PlayCount` is absent), `studio`, `runtimeMinutes`
(`RunTimeTicks` ÷ 10,000 ÷ 60,000), the shared file-tech fields (`fileContainer`/`videoCodec`/
`audioCodec`/`fileResolution`/`fileSizeBytes`, from `MediaSources`/`MediaStreams`), `releaseDate`
(`PremiereDate`), `labels` (`Tags`, shared with Plex's `Label` tags), `jellyfinAddedAt` (`DateCreated`,
kept prefixed and separate from `plexAddedAt` — mutually-exclusive server choices), and `isFavorite`
(`UserData.IsFavorite`, no other producer). Loses precedence to Tautulli and Plex for `playCount`/
`lastWatchedAt` (`contestedFieldPrecedence`: Tautulli > Plex > Jellyfin, a fixed literal order pending
the settings-driven `primaryMediaServer` Plex/Jellyfin swap `_precedence.md` designs). `genres`/
`certification` are deliberately not wired as Jellyfin-producer fields — same construction-time-vs-
enrichment-overwrite gap Plex's `genres`/`certification` hit, blocked on precedence-ordering machinery.
Gated into `ruleRegistry.ts` (`studio`, `runtimeMinutes`, `fileContainer`, `videoCodec`, `audioCodec`,
`fileResolution`, `fileSizeBytes`, `releaseDaysAgo`, `labels`, `watched`, `lastWatchedDaysAgo`,
`jellyfinAddedDaysAgo`, `jellyfinIsFavorite`).

## Overseerr

**What it is:** media request/discovery front-end that sits in front of Radarr/Sonarr.

**Role:** `MediaEnricher`. No `MediaActuator` implementation — `OverseerrProvider` does not implement
`MediaActuator` or declare `tasks()`.

**Auth:** API key (`X-Api-Key` header).

**What the app can pull today** ([`connections/overseerrProvider.ts`](ref:path:server/modules/providers/connections/overseerrProvider.ts)):
`getRequests()`, `getIssues()`, `search(query)`.

**Wired into the media-item pipeline?** Yes — `overseerrEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getRequests()`+`getIssues()`, runs them through `overseerrFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts)) into
`overseerrRequestStatus`/`overseerrHasIssue` keyed by `tmdbId`. Gated into `ruleRegistry.ts`.

## Seerr

**What it is:** a fork of Overseerr with an identical API surface — a separate `MetadataProviderType` so
the two can be configured and constrained (single-active) independently, not a different system.

**Role:** same as Overseerr in every respect the code can express — `OverseerrProvider` is directly
re-exported as `SeerrProvider`
([`connections/seerrProvider.ts`](ref:path:server/modules/providers/connections/seerrProvider.ts)): "Seerr
is a fork of Overseerr with an identical API. Re-export `OverseerrProvider` under a distinct name so the DI
container can register it as a separate SEERR-typed provider."

**Auth:** API key (`X-Api-Key` header), identical to Overseerr.

**What the app can pull today:** identical method set to Overseerr (same class).

**Wired into the media-item pipeline?** No. `ProviderFactory.create`
([`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts))'s
switch has no `SEERR` case — Seerr is only constructed ad hoc in
`providers.procedures.ts`'s ad-hoc `metadata` procedure (`OVERSEERR`/`SEERR` share one case there, calling
`getRequests()` to prove connectivity). It is absent from `enricherAdapters.ts`, `ProviderSet`, and
`ruleRegistry.ts` entirely — configuring Seerr today gets you a working connection test and nothing
else; even the `overseerrEnricher` role Overseerr itself plays is not extended to a configured Seerr
instance.

## TMDB (The Movie Database)

**What it is:** general-purpose movie/TV metadata and ratings service.

**Role:** `MediaEnricher`. No `MediaActuator` — read-only metadata source.

**Auth:** API key (`api_key` query param).

**What the app can pull today** ([`connections/tmdbProvider.ts`](ref:path:server/modules/providers/connections/tmdbProvider.ts)):
`getStatus(tmdbId)`, `search(query)`, `getMovieDetails`/`getTvDetails`, enriched variants
`getMovieDetailsEnriched`/`getTvDetailsEnriched` (certification, keywords, collection, spoken languages,
origin country), `getMovieWatchProviders`/`getTvWatchProviders` (streaming-service flags for a region),
and `getRatings(title, year)` (title-search based rating lookup used by the separate ratings-aggregation
feature, below).

**Wired into the media-item pipeline?** Partially. `tmdbEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) only
calls `getStatus(tmdbId)`, contributing a single field (`tmdbStatus`), gated into `ruleRegistry.ts`. The
much larger enriched-details/watch-providers/ratings surface (`getMovieDetailsEnriched`, watch providers,
`getRatings`) is implemented but consumed only by the separate on-demand
`ratingsAggregation.ts`/`providers.ratings` procedure and `TmdbService`'s trending-backdrops
feature ([`server/modules/providers/tmdbService.ts`](ref:path:server/modules/providers/tmdbService.ts),
unrelated background-image fetching) — none of it flows through `EnrichmentJob` onto a `MediaItem`. Also
note `ruleRegistry.ts`'s `genres`/`year`/`certification` rules already list TMDB as a `providers`
entry even though no enricher currently populates those fields from TMDB for a `MediaItem` — those entries
describe a plausible source, not a wired one.

## OMDB (Open Movie Database)

**What it is:** IMDB-backed ratings/metadata lookup service (also aggregates Rotten Tomatoes and
Metacritic scores).

**Role:** inert toward the media pipeline today — `OmdbProvider` implements neither `MediaSource` nor
`MediaEnricher` nor `MediaActuator`; it exists purely as a callable connection.

**Auth:** API key (`apikey` query param).

**What the app can pull today** ([`connections/omdbProvider.ts`](ref:path:server/modules/providers/connections/omdbProvider.ts)):
a single method, `getRatings(title, year)` — title-search (movie, falling back to series) returning IMDB
rating/votes, Rotten Tomatoes %, Metacritic score, award-winner/Oscar-winner flags (regex over the
`Awards` string), director, actors, language, box office.

**Wired into the media-item pipeline?** No — used only by the separate ratings-aggregation feature
(`server/modules/providers/ratingsAggregation.ts`, the `providers.ratings` procedure in `providers.procedures.ts`). Not an
enricher, not referenced by `enricherAdapters.ts` or `ruleRegistry.ts` for any `MediaItem` field. (The
`certification`/`imdbRating` rules in `ruleRegistry.ts` list `OMDB` as a `providers` entry, but no
enricher currently populates either field from OMDB — same "listed but not wired" gap as TMDB's
`genres`/`year`/`certification` entries above.)

## TVMaze

**What it is:** free, keyless public TV-show metadata/ratings API.

**Role:** inert toward the media pipeline today — `TvMazeProvider` implements none of `MediaSource`/
`MediaEnricher`/`MediaActuator`.

**Auth:** none. `ProviderFactory.createTvMaze()`
([`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts))
constructs it directly against the public `https://api.tvmaze.com` base with `apiKey: null` — no
`metadata_provider` row is required to use it.

**What the app can pull today** ([`connections/tvmazeProvider.ts`](ref:path:server/modules/providers/connections/tvmazeProvider.ts)):
`search(query)`, `getShow(tvmazeId)` (includes `genres`, `network.name`/`network.country`, `rating.average`,
`externals` id crosswalk to TVDB/IMDB), `lookupByTvdbId(tvdbId)`, and `getRatings(title, year)` (used by
ratings aggregation).

**Wired into the media-item pipeline?** No — used only by ratings aggregation
(`ratingsAggregation.ts`). `ruleRegistry.ts`'s `network` rule already lists `TVMAZE` as a
`providers` entry alongside Sonarr; this one is a real, live-testable capability (`getShow` genuinely
returns per-show `network` data) that simply has no enricher built yet — unlike the TMDB/OMDB
"listed but nothing populates it" cases above, TVMaze's is a buildable gap, not a stale one.

## Summary table

| Provider | Role(s) | Wired into media-item pipeline? |
|---|---|---|
| Radarr | MediaSource (movie), MediaActuator | Yes — source fields direct to `ruleRegistry` |
| Sonarr | MediaSource (series), MediaActuator | Yes — source fields direct to `ruleRegistry` |
| Tautulli | MediaEnricher, MediaActuator | Yes — `tautulliEnricher` |
| Plex | MediaEnricher, MediaActuator | Yes — `plexEnricher` + identity stamping |
| Jellyfin | MediaEnricher, MediaActuator | Yes — `jellyfinEnricher` |
| Overseerr | MediaEnricher | Yes — `overseerrEnricher` |
| Seerr | (same API as Overseerr; role not extended in code) | No — connection-test only, no `ProviderFactory`/enricher wiring |
| TMDB | MediaEnricher | Partially — only `getStatus` wired; richer surface used by ratings aggregation only |
| OMDB | inert | No — ratings aggregation only |
| TVMaze | inert | No — ratings aggregation only; `network` data is real and buildable |

## Relationship to `MediaFieldProvider`/`MediaFieldSource`

This catalog is the ground-truth input
[`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md)'s
adapters bind to — this doc is where to check which providers actually expose data today (and via which
connection method) before assuming a new enrichable field is easy to add. In particular: TVMaze's
`network` data is real and already half-declared in `ruleRegistry.ts` but has no adapter; TMDB and
OMDB's ratings/details surfaces are fully implemented in their connection classes but sit behind the
separate ratings-aggregation feature, not the enrichment job, so wiring them into a
`MediaFieldProvider` is plausible future work, not a rebuild from nothing; Seerr has no adapter at all
despite sharing Overseerr's exact API — the cheapest of all these gaps to close, since `overseerrEnricher`
would work unmodified against a Seerr-typed instance if `ProviderFactory` and `enricherAdapters.ts` were
extended to construct and bind one.
