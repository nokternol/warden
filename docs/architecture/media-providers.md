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
`ruleRegistry.ts` — no enrichment step needed for source-owned data. A record's ratings are read
through [`contract/ratings.ts`](ref:path:contract/ratings.ts) (`ratingsOf`), the one reader shared with
the Media page's ratings panel: `imdbRating` is its IMDb entry, and an unrated entry (value 0 with no
votes) leaves it undefined. Sonarr's `communityRating` is read the same way.

## Sonarr

**What it is:** TV series library manager/downloader — the series catalog owner.

**Role:** `MediaSource` (series) + `MediaActuator`, symmetric to Radarr.

**Auth:** API key (`?apikey=` query param).

**What the app can pull today** ([`connections/sonarrProvider.ts`](ref:path:server/modules/providers/connections/sonarrProvider.ts)):
`getSeries()`, `getProfiles()`, `getLanguageProfiles()`, `getRootFolders()`, `getTags()`,
`lookupSeries(term)`. Every actuator task is real (calls Sonarr's API): `unmonitorSeries()`,
`triggerSeriesSearch()`, `deleteSeries()`, `deleteSeriesKeepFiles()`, `changeQualityProfile()`,
`applyTag()` (add/remove), `refreshSeries()`, `rescanSeries()`, `renameSeries()`. None are
modelled-only. `moveSeries` and `changeLanguageProfile` are deliberately not built as tasks, because each needs a
parameter (target root folder; target language profile id) that is not declared yet,
the same reason Radarr's `moveMovie` is not built.

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
`getLibraryStats()`, `getHomeStats()`, `getHistory()` (every row, paged 1000 at a time),
`searchHistory(title)`. History rows leave the provider with `rating_key`/`grandparent_rating_key`
as text: Tautulli sends them as numbers, and every other Plex key in Warden is text, so a numeric
key would never match a Plex item.

**Actuator task:** `deleteWatchHistory` only. It looks each Plex key up as `rating_key` and
`grandparent_rating_key` with `grouping: 0`, because by default Tautulli merges the sessions of
one viewing (paused, resumed later) into one row that carries a single id; deleting those rows
would leave the other sessions behind. Rows with `row_id: null` (not yet stored, such as a stream
still playing) are skipped.

**Wired into the media-item pipeline?** Yes — `tautulliEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getHistory()`, runs it through `tautulliFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts),
see [`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md))
into `playCount`/`lastWatchedAt` keyed by `plexRatingKey`, and wins precedence over Plex for both
fields in `contestedFieldPrecedence`. Gated into `ruleRegistry.ts` (`watched`, `lastWatchedDaysAgo`).

**What counts as a view.** History is read grouped (Tautulli's default), so one row is one viewing
however many sessions it took. Only rows with `watched_status === 1` count — the viewing passed
Tautulli's watched threshold (its setting, default 85%; Plex's own default is 90%), the level at
which Plex would mark it watched. Partial plays (`0`, `0.25`, `0.5`, `0.75`) and rows with no id are
ignored. `lastWatchedAt` is the `stopped` time (Unix seconds) of the latest counted viewing; Tautulli
also sends `date`/`started` (when it began), which are not used. An episode's views count toward
its show (`grandparent_rating_key`), which is what a series is matched by.

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
stamped onto `media_identity` groups by the identity job (`runForPlex`) for `plexRatingKey` matching,
by the `Guid` ids a listing carries with `includeGuids=1` — never inserts a group of its own.

## Jellyfin

**What it is:** alternative media server (Plex analog).

**Role:** `MediaEnricher` + `MediaActuator`. Explicitly *not* `MediaSource`, same "media servers cannot
own" limitation as Plex — Jellyfin only enriches Radarr/Sonarr-owned items, matched by
`_sourceIds.jellyfin` (populated by the identity job's `runForJellyfin` stamping pass, matching by
`contentType` + `tmdbId`/`tvdbId`, mirroring `runForPlex`).

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
the settings-driven `primaryMediaServer` Plex/Jellyfin swap, which nothing calls yet). `genres`/
`certification` are deliberately not wired as Jellyfin-producer fields — same construction-time-vs-
enrichment-overwrite gap Plex's `genres`/`certification` hit, blocked on precedence-ordering machinery.
Gated into `ruleRegistry.ts` (`studio`, `runtimeMinutes`, `fileContainer`, `videoCodec`, `audioCodec`,
`fileResolution`, `fileSizeBytes`, `releaseDaysAgo`, `labels`, `watched`, `lastWatchedDaysAgo`,
`jellyfinAddedDaysAgo`, `jellyfinIsFavorite`).

## Seerr

**What it is:** media request/discovery front-end that sits in front of Radarr/Sonarr. Seerr is
Overseerr's API-compatible successor, so one provider type (`SEERR`) and one connection class serve a
Seerr server and an Overseerr server alike; there is no separate Overseerr type.

**Role:** `MediaEnricher`. No `MediaActuator` implementation — `SeerrProvider` does not implement
`MediaActuator` or declare `tasks()`.

**Auth:** API key (`X-Api-Key` header).

**What the app can pull today** ([`connections/seerrProvider.ts`](ref:path:server/modules/providers/connections/seerrProvider.ts)):
`getRequests()`, `getIssues()`, `search(query)`.

**Wired into the media-item pipeline?** Yes — `seerrEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) calls
`getRequests()`+`getIssues()`, runs them through `seerrFieldProvider`
([`mediaFieldProvider.ts`](ref:path:server/modules/media/mediaFieldProvider.ts)) into
`seerrRequestStatus`/`seerrHasIssue` keyed by `tmdbId`. Gated into `ruleRegistry.ts`.
[`ProviderFactory`](ref:path:server/modules/providers/providerFactory.ts) builds it for the `SEERR` type, and
the connection probe checks `/api/v1/status`. The tests mock both an Overseerr server and a Seerr server; behaviour against a live Seerr
server is not yet verified.

## TMDB (The Movie Database)

**What it is:** general-purpose movie/TV metadata and ratings service.

**Role:** `MediaEnricher`. No `MediaActuator` — read-only metadata source.

**Auth:** API key (`api_key` query param).

**What the app can pull today** ([`connections/tmdbProvider.ts`](ref:path:server/modules/providers/connections/tmdbProvider.ts)):
`getStatus(tmdbId)`, `getMovieDetailsEnriched`/`getTvDetailsEnriched` (certification, keywords,
collection, spoken languages, origin country), and `getMovieWatchProviders`/`getTvWatchProviders`
(streaming-service flags for a region).

**Wired into the media-item pipeline?** Partially. `tmdbEnricher`
([`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) only
calls `getStatus(tmdbId)`, contributing a single field (`tmdbStatus`), gated into `ruleRegistry.ts`. The
larger enriched-details and watch-providers surface is implemented but has no consumer, and nothing
reads TMDB's `vote_average` as a rating. `TmdbService`'s trending-backdrops feature
([`server/modules/providers/tmdbService.ts`](ref:path:server/modules/providers/tmdbService.ts),
unrelated background-image fetching) calls TMDB on its own. None of it flows through `EnrichmentJob`
onto a `MediaItem`. Also
note `ruleRegistry.ts`'s `genres`/`year`/`certification` rules already list TMDB as a `providers`
entry even though no enricher currently populates those fields from TMDB for a `MediaItem` — those entries
describe a plausible source, not a wired one.

## OMDB (Open Movie Database)

**What it is:** IMDB-backed ratings/metadata lookup service (also aggregates Rotten Tomatoes and
Metacritic scores).

**Role:** inert. `OmdbProvider` implements none of `MediaSource`, `MediaEnricher` or `MediaActuator`.
It is the connection `ProviderFactory` builds for the type, and it carries only what the base
connection gives every provider.

**Auth:** API key (`apikey` query param).

**What the app can pull today** ([`connections/omdbProvider.ts`](ref:path:server/modules/providers/connections/omdbProvider.ts)):
nothing. The type is deferred and has no consumer. Per-source ratings would need an identity-keyed
store before OMDb has anything to feed, since a title search is ambiguous.

**Wired into the media-item pipeline?** No. No enricher or rule names OMDB as a producer.

## TVMaze

**What it is:** free, keyless public TV-show metadata/ratings API.

**Role:** inert toward the media pipeline today — `TvMazeProvider` implements none of `MediaSource`/
`MediaEnricher`/`MediaActuator`.

**Auth:** none. `ProviderFactory.createTvMaze()`
([`server/modules/providers/providerFactory.ts`](ref:path:server/modules/providers/providerFactory.ts))
constructs it directly against its provider-catalogue `defaultUrl`, the public `https://api.tvmaze.com`
base, with `apiKey: null` — no
`metadata_provider` row is required to use it.

**What the app can pull today** ([`connections/tvmazeProvider.ts`](ref:path:server/modules/providers/connections/tvmazeProvider.ts)):
`lookupByTvdbId(tvdbId)`, which resolves a TVmaze show id from a TheTVDB id.

**Wired into the media-item pipeline?** No. `ruleRegistry.ts`'s `network` rule lists `TVMAZE` as a
`providers` entry beside Sonarr. TVmaze's show endpoint does return per-show `network` data, so this is
a buildable gap (an enricher and a show read), not a stale entry like TMDB's.

## Summary table

**Offered** means the type can be configured: it is served by `GET /api/providers/types` and accepted by
provider create and the connection test. The other types are declared deferred in
[`contract/scope.ts`](ref:path:contract/scope.ts); their code stays compiled and tested, and no API path
reaches them.

| Provider | Role(s) | Wired into media-item pipeline? | Offered? |
|---|---|---|---|
| Radarr | MediaSource (movie), MediaActuator | Yes — source fields direct to `ruleRegistry` | Yes |
| Sonarr | MediaSource (series), MediaActuator | Yes — source fields direct to `ruleRegistry` | Yes |
| Tautulli | MediaEnricher, MediaActuator | Yes — `tautulliEnricher` | Yes |
| Plex | MediaEnricher, MediaActuator | Yes — `plexEnricher` + identity stamping | Yes |
| Jellyfin | MediaEnricher, MediaActuator | Yes — `jellyfinEnricher` | Yes |
| Seerr | MediaEnricher | Yes — `seerrEnricher` | Yes (the request manager) |
| TMDB | MediaEnricher | Partially — only `getStatus` wired; the enriched-details and watch-providers surface has no consumer | No |
| OMDB | inert | No — no consumer | No |
| TVMaze | inert | No — `network` data is real and buildable | No |

## Relationship to `MediaFieldProvider`/`MediaFieldSource`

This catalog is the ground-truth input
[`docs/architecture/media-field-provider-role.md`](ref:path:docs/architecture/media-field-provider-role.md)'s
adapters bind to — this doc is where to check which providers actually expose data today (and via which
connection method) before assuming a new enrichable field is easy to add. In particular: TVMaze's
`network` data is real and already half-declared in `ruleRegistry.ts` but has no adapter; TMDB's
enriched-details surface is implemented in its connection class with no consumer, so wiring it into a
`MediaFieldProvider` is plausible future work, not a rebuild from nothing — the Seerr adapter is the model: a thin shell binding a connection to the role.
