# Warden — Provider Metadata Inventory
Generated: 2026-06-05  
Method: parallel subagents per provider group, consolidated into this document.

> **Dated snapshot, not current fact.** This records what each provider's API offers and what Warden
> fetched as of the date above. File paths, type names and "currently fetched/filterable" columns may
> no longer match the code; `docs/architecture/` describes what is built, and
> `docs/architecture/VOCABULARY.md` lists retired names. The request manager is one provider type,
> Seerr (`SEERR`, `SeerrProvider`), with `seerr`-prefixed field keys; this document's "Overseerr"
> names the server product.

---

## How to read this document

- **Currently fetched** = the Warden provider TypeScript type maps this field from the API response.
- **Currently filterable** = the field has a working server-side branch in `mediaFilters.ts` or `media.handler.ts`.
- **Join key** = this field is a cross-provider identifier (tmdbId, tvdbId, imdbId, ratingKey).
- **Filter potential** = high / medium / low automation value.

Tier classification:
- **Tier 1** — single provider, in-memory, no join needed
- **Tier 2** — cross-provider join required (tmdbId/tvdbId/imdbId bridge)
- **Tier 3** — computed/derived from existing data

---

## Critical findings (read before the tables)

1. **`mediaEnrichment` table does not exist.** The QUERIES.md plan references it, but `server/database/schema.ts` has no such table. It must be designed and built from scratch for Tier 2 predicates.

2. **Jellyfin has zero filter branches anywhere** — not in `mediaFilters.ts`, not in `media.handler.ts`, not in `AutomationExecutor`. Its tasks are declared in `PROVIDER_REGISTRY` but have no server implementation. The `JellyfinItem` TypeScript type captures only 4 of ~80 available fields.

3. **Overseerr `mediaInfo` is typed `unknown`** — none of the status, issues, downloadStatus, or externalServiceId fields are accessible in TypeScript. The `/api/v1/request` endpoint (not `/api/v1/search`) is the correct data source for filterable Overseerr fields.

4. **`tautulliWatched` is fully implemented** (corrected from earlier assumption). It is wired in `media.handler.ts` using `get_history` with title-string matching. The design limitation is title-based join, not missing implementation.

5. **Plex `guid`/`guids` array** encodes `imdb://`, `tmdb://`, `thetvdb://` IDs and would enable reliable ID-based cross-provider joins from Plex viewCount/lastViewedAt to Radarr/Sonarr items — bypassing the current fragile title match.

6. **Tautulli `get_library_media_info`** is the correct endpoint for per-item `play_count` and `last_played`. Warden currently only calls `get_history`, which gives session rows requiring deduplication. This endpoint is never called.

7. **Radarr `profileId`** is a legacy field (always 0 in API v3). Safe to remove from the TypeScript type.

8. **OMDB rate limit** is 1,000 req/day on the free tier. An enrichment job must respect this — batch by title rather than per-automation-tick, and cache aggressively.

9. **Overseerr `getRequests()` has no pagination** — large instances silently miss items on pages 2+.

10. **Sonarr `tmdbId`** is present in the live API response but not in Warden's `SonarrSeries` type — a missed join key.

---

## Provider: Radarr

Source: `GET /api/v3/movie` — returns all movies in one response (no pagination).

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|
| id | number | YES | no | no | low | — |
| title | string | YES | YES (title search) | no | high | 1 |
| year | number | YES | YES (yearMin/yearMax) | no | high | 1 |
| hasFile | boolean | YES | YES | no | high | 1 |
| qualityProfileId | number | YES | YES (movieQualityProfileIds) | no | high | 1 |
| genres | string[] | YES | YES (movieGenres) | no | high | 1 |
| tags | number[] | YES | YES (movieTagIds) | no | high | 1 |
| monitored | boolean | YES | **NO** | no | high | 1 |
| tmdbId | number | YES | no | YES → TMDB, Overseerr | low | join key |
| images | RadarrImage[] | YES | no | no | low | — |
| folderName | string | YES | no | no | low | — |
| path | string | YES | no | no | low | — |
| profileId | number | YES (LEGACY — always 0) | no | no | low | drop |
| **added** | string (ISO date) | **NO** | **NO** | no | **HIGH** | **1** |
| **sizeOnDisk** | number (bytes) | **NO** | **NO** | no | **HIGH** | **1** |
| **certification** | string | **NO** | **NO** | no | **HIGH** | **1** |
| **ratings.imdb.value** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **ratings.tmdb.value** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **ratings.metacritic.value** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **ratings.rottenTomatoes.value** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **popularity** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **status** | string (MovieStatusType) | **NO** | **NO** | no | **HIGH** | **1** |
| **runtime** | number (minutes) | **NO** | **NO** | no | medium | 1 |
| **studio** | string | **NO** | **NO** | no | medium | 1 |
| **rootFolderPath** | string | **NO** | **NO** | no | medium | 1 |
| **imdbId** | string | **NO** | no | YES → OMDB | low | join key |
| **movieFile.size** | number (bytes) | **NO** | **NO** | no | high | 1 |
| **movieFile.dateAdded** | string (ISO date) | **NO** | **NO** | no | high | 1 |
| **movieFile.mediaInfo.videoCodec** | string | **NO** | **NO** | no | medium | 1 |
| **movieFile.mediaInfo.resolution** | string | **NO** | **NO** | no | medium | 1 |
| **movieFile.mediaInfo.videoDynamicRangeType** | string | **NO** | **NO** | no | medium | 1 |
| **statistics.sizeOnDisk** | number (bytes) | **NO** | **NO** | no | high | 1 |
| isAvailable | boolean | NO | NO | no | medium | 1 |
| inCinemas | string (ISO date) | NO | NO | no | medium | 1 |
| digitalRelease | string (ISO date) | NO | NO | no | medium | 1 |
| originalLanguage.name | string | NO | NO | no | medium | 1 |
| keywords | string[] | NO | NO | no | medium | 1 |
| collection.tmdbId | number | NO | NO | YES → TMDB | medium | join key |

**Radarr Tier 1 priority list** (not fetched, high value, zero join cost):
`added`, `sizeOnDisk` (or `statistics.sizeOnDisk`), `certification`, `ratings.imdb.value`, `ratings.rottenTomatoes.value`, `popularity`, `status`, `runtime`, `studio`

**Already fetched, not filterable** (lowest-friction additions):
`monitored`

---

## Provider: Sonarr

Source: `GET /api/v3/series` — returns all series in one response (no pagination).

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|
| id | number | YES | no | no | low | — |
| title | string | YES | YES (title search) | no | high | 1 |
| year | number | YES | YES (yearMin/yearMax) | no | high | 1 |
| monitored | boolean | YES | YES | no | high | 1 |
| status | string (SeriesStatusType) | YES | YES (seriesStatus) | no | high | 1 |
| qualityProfileId | number | YES | YES (seriesQualityProfileIds) | no | high | 1 |
| genres | string[] | YES | YES (seriesGenres) | no | high | 1 |
| tags | number[] | YES | YES (seriesTagIds) | no | high | 1 |
| seriesType | string | YES | YES (seriesType) | no | high | 1 |
| network | string | YES | YES (network) | no | high | 1 |
| tvdbId | number | YES | no | YES → TheTVDB, TVMaze | low | join key |
| languageProfileId | number | YES | no | no | medium | 1 |
| seasons | SonarrSeason[] | YES | no | no | medium | 1 |
| path | string | YES | no | no | low | — |
| images | SonarrImage[] | YES | no | no | low | — |
| profileId | number | YES (LEGACY — always 0) | no | no | low | drop |
| **added** | string (ISO date) | **NO** | **NO** | no | **HIGH** | **1** |
| **ended** | boolean | **NO** | **NO** | no | **HIGH** | **1** |
| **previousAiring** | string (ISO date) | **NO** | **NO** | no | **HIGH** | **1** |
| **lastAired** | string (ISO date) | **NO** | **NO** | no | **HIGH** | **1** |
| **certification** | string | **NO** | **NO** | no | **HIGH** | **1** |
| **ratings.value** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **statistics.sizeOnDisk** | number (bytes) | **NO** | **NO** | no | **HIGH** | **1** |
| **statistics.percentOfEpisodes** | number (0–100) | **NO** | **NO** | no | **HIGH** | **1** |
| **statistics.episodeFileCount** | number | **NO** | **NO** | no | high | 1 |
| **tmdbId** | number | **NO** (in live response, not in type) | no | YES → TMDB | low | join key |
| **imdbId** | string | **NO** | no | YES → OMDB | low | join key |
| **tvMazeId** | number | **NO** | no | YES → TVMaze | low | join key |
| runtime | number (minutes) | NO | NO | no | medium | 1 |
| rootFolderPath | string | NO | NO | no | medium | 1 |
| nextAiring | string (ISO date) | NO | NO | no | medium | 1 |
| originalLanguage.name | string | NO | NO | no | medium | 1 |

**Sonarr Tier 1 priority list** (not fetched, high value, zero join cost):
`added`, `ended`, `previousAiring`/`lastAired`, `certification`, `ratings.value`, `statistics.sizeOnDisk`, `statistics.percentOfEpisodes`

**Note:** Sonarr `tmdbId` and `tvMazeId` are in the live API response but missing from Warden's `SonarrSeries` TypeScript type — add these to unlock Tier 2 joins.

---

## Provider: Tautulli

Sources: `get_history` (currently used), `get_library_media_info` (not used — highest value endpoint).

| Field name | JS type | API source | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|---|
| title | string | get_history | YES | YES (title-set match for tautulliWatched) | no | high | 1 |
| rating_key | string | get_history | YES | **NO** (fetched, unused) | YES → Plex ratingKey | high | join key |
| watched_status | number (0/1) | get_history | YES | **NO** (fetched, unused) | no | high | 1 |
| duration | number (seconds) | get_history | YES | **NO** (fetched, unused) | no | medium | 1 |
| play_duration | number (seconds) | get_history | YES | **NO** (fetched, unused) | no | medium | 1 |
| user | string | get_history | YES | **NO** (fetched, unused) | no | medium | 1 |
| **play_count** | number | **get_library_media_info** | **NO** | **NO** | no | **HIGH** | **2** |
| **last_played** | number (Unix ts) | **get_library_media_info** | **NO** | **NO** | no | **HIGH** | **2** |
| **file_size** | number (bytes) | **get_library_media_info** | **NO** | **NO** | no | medium | 2 |
| **video_resolution** | string | **get_library_media_info** | **NO** | **NO** | no | medium | 2 |
| **video_codec** | string | **get_library_media_info** | **NO** | **NO** | no | medium | 2 |
| percent_complete | number | get_history | NO | NO | no | high | 1 |
| date | number (Unix ts) | get_history | NO | NO | no | high | 1 |
| media_type | string | get_history | NO | NO | no | high | 1 |

**Important:** `get_library_media_info` returns stable per-item `play_count` and `last_played` — far better for automation than deduplicating session rows from `get_history`. This endpoint is never called by Warden today.

**Join note:** `tautulli.rating_key` = `plex.ratingKey` — the bridge between Tautulli and Plex. Parsing `plex.guids` then maps to tmdbId/tvdbId for Radarr/Sonarr joins.

---

## Provider: Plex

Source: `GET /library/sections/:key/all` — currently fetches only 5 fields.  
**Plex is not in the media filter pipeline.** It is used only for library listing in settings/onboarding.

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|
| ratingKey | string | YES | NO | YES → Tautulli rating_key | high | join key |
| title | string | YES | NO | no | high | 2 |
| type | string | YES | NO | no | medium | — |
| year | number | YES | NO | no | medium | — |
| thumb | string | YES | NO | no | low | — |
| **viewCount** | number | **NO** | **NO** | no | **HIGH** | **2** |
| **lastViewedAt** | number (Unix ts) | **NO** | **NO** | no | **HIGH** | **2** |
| **addedAt** | number (Unix ts) | **NO** | **NO** | no | **HIGH** | **2** |
| **contentRating** | string | **NO** | **NO** | no | **HIGH** | **2** |
| **guid** (primary) | string | **NO** | **NO** | encodes imdb/tmdb/tvdb | high | join key |
| **guids** (array) | string[] | **NO** | **NO** | YES → imdb/tmdb/tvdb | high | join key |
| audienceRating | number | NO | NO | no | medium | 2 |
| duration | number (ms) | NO | NO | no | medium | 2 |
| originallyAvailableAt | string (date) | NO | NO | no | medium | 2 |
| viewOffset | number (ms) | NO | NO | no | medium | 2 |

**Key insight:** Plex `guids` array (e.g. `["imdb://tt1234", "tmdb://5678", "thetvdb://9012"]`) is the reliable cross-provider join path. Parsing these converts Plex viewCount/lastViewedAt into something joinable to Radarr `tmdbId` and Sonarr `tvdbId` — much more reliable than title matching.

---

## Provider: Jellyfin

Source: `GET /Users/{userId}/Items` — returns full `BaseItemDto` (~80 fields).  
**Warden's `JellyfinItem` type captures only 4 of those fields. The rest arrive in the HTTP response and are silently discarded at the TypeScript boundary.**

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|
| Id | string | YES | NO | no | low | — |
| Name | string | YES | NO | no | high | 1 |
| Type | string | YES | NO | no | medium | — |
| ProductionYear | number | YES | NO | no | medium | 1 |
| **UserData.Played** | boolean | **NO** | **NO** | no | **HIGH** | **1** |
| **UserData.PlayCount** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **UserData.LastPlayedDate** | string (ISO) | **NO** | **NO** | no | **HIGH** | **1** |
| **UserData.IsFavorite** | boolean | **NO** | **NO** | no | **HIGH** | **1** |
| **OfficialRating** | string | **NO** | **NO** | no | **HIGH** | **1** |
| **CommunityRating** | number | **NO** | **NO** | no | **HIGH** | **1** |
| **Tags** | string[] | **NO** | **NO** | no | **HIGH** | **1** |
| **Genres** | string[] | **NO** | **NO** | no | **HIGH** | **1** |
| **DateCreated** | string (ISO) | **NO** | **NO** | no | **HIGH** | **1** |
| **ProviderIds.Tmdb** | string | **NO** | **NO** | YES → TMDB, Radarr | medium | join key |
| **ProviderIds.Imdb** | string | **NO** | **NO** | YES → OMDB | medium | join key |
| **ProviderIds.Tvdb** | string | **NO** | **NO** | YES → Sonarr, TVMaze | medium | join key |
| UserData.PlaybackPositionTicks | number | NO | NO | no | medium | 1 |
| UserData.PlayedPercentage | number | NO | NO | no | medium | 1 |
| CriticRating | number | NO | NO | no | medium | 1 |
| RunTimeTicks | number | NO | NO | no | medium | 1 |
| Studios | NameGuidPair[] | NO | NO | no | medium | 1 |
| PremiereDate | string (ISO) | NO | NO | no | medium | 1 |
| DateLastMediaAdded | string (ISO) | NO | NO | no | medium | 1 |

**Server-side filtering opportunity:** Jellyfin's `/Users/{userId}/Items` accepts `Filters=IsPlayed`, `Filters=IsUnplayed`, `Filters=IsFavorite`, `tags=`, `genres=`, `officialRatings=`, `years=` query params. Warden currently passes only `ParentId` and `Recursive=true`. Adding server-side pre-filtering would reduce payload size dramatically for large libraries.

**AutomationExecutor does not dispatch for Jellyfin.** The tasks in `PROVIDER_REGISTRY.JELLYFIN.tasks` have no server implementation.

---

## Provider: Overseerr / Seerr

Sources: `GET /api/v1/request` (filterable data), `GET /api/v1/search` (mediaInfo typed as `unknown`).  
Seerr is API-compatible with Overseerr, so one provider type, `SEERR` (`SeerrProvider`), serves both servers.

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Tier |
|---|---|---|---|---|---|---|
| request.id | number | YES | NO | no | low | — |
| **request.status** | number (1=PENDING, 2=APPROVED, 3=DECLINED) | YES | **NO** | no | **HIGH** | **2** |
| request.type | string | YES | NO | no | medium | — |
| **request.createdAt** | string (ISO) | YES | **NO** | no | **HIGH** | **2** |
| request.requestedBy.id | number | YES | NO | no | medium | — |
| request.requestedBy.displayName | string | YES | NO | no | medium | 2 |
| request.media.tmdbId | number | YES | NO | YES → Radarr, TMDB | high | join key |
| request.media.title | string | YES | NO | no | low | — |
| searchResult.mediaInfo | unknown | YES (as `unknown`) | NO | — | **HIGH** (inaccessible) | — |
| **mediaInfo.status** | number (1–6 enum) | **NO** | **NO** | no | **HIGH** | **2** |
| **mediaInfo.mediaAddedAt** | string (ISO) | **NO** | **NO** | no | **HIGH** | **2** |
| **mediaInfo.externalServiceId** | number | **NO** | **NO** | YES → Radarr/Sonarr id | **HIGH** | join key |
| **mediaInfo.tmdbId** | number | **NO** | **NO** | YES → TMDB, Radarr | high | join key |
| **mediaInfo.tvdbId** | number | **NO** | **NO** | YES → Sonarr, TVMaze | medium | join key |
| **mediaInfo.issues** | Issue[] | **NO** | **NO** | no | **HIGH** | **2** |
| **mediaInfo.downloadStatus** | DownloadingItem[] | **NO** | **NO** | no | high | 2 |
| **mediaInfo.seasons** | Season[] | **NO** | **NO** | no | high | 2 |
| request.is4k | boolean | NO | NO | no | medium | 2 |
| request.isAutoRequest | boolean | NO | NO | no | medium | 2 |
| request.seasons | SeasonRequest[] | NO | NO | no | high | 2 |

**Seerr-only fields:**

| Field name | JS type | Filter potential | Notes |
|---|---|---|---|
| mediaInfo.jellyfinMediaId | string | medium | Direct join to Jellyfin Id |
| mediaInfo.watchlists | Watchlist[] | medium | "is on a watchlist" predicate |
| mediaInfo.blocklist | Blocklist | medium | Block-listed items |

**`mediaInfo.status` enum (critical for filters):**
1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED

**Pagination gap:** `getRequests()` fetches only page 1. Must add pagination loop.

---

## Provider: TMDB

Source: TMDB enrichment via `tmdbProvider.ts` — used to enrich Radarr/Sonarr items with metadata.

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Extra call? |
|---|---|---|---|---|---|---|
| id | number | YES | NO | YES (tmdbId) | — | NO |
| vote_average | number | YES | **NO** | no | **HIGH** | NO |
| vote_count | number | YES | NO | no | high | NO |
| popularity | number | YES | **NO** | no | **HIGH** | NO |
| release_date | string | YES | NO | no | high | NO |
| first_air_date | string | YES | NO | no | high | NO |
| genres | array | YES | NO | no | high | NO |
| imdb_id | string | YES | NO | YES → OMDB | high | NO |
| number_of_seasons | number | YES | NO | no | high | NO |
| certification | string (enriched) | YES | **NO** | no | **HIGH** | NO (append_to_response) |
| keywords | string[] | YES | NO | no | medium | NO (append_to_response) |
| collectionId / collectionName | number/string | YES | NO | no | medium | NO (append_to_response) |
| spokenLanguages | string[] | YES | NO | no | medium | NO (append_to_response) |
| originCountry | string[] | YES | NO | no | medium | NO (append_to_response) |
| streaming.* (8 booleans) | boolean | YES | **NO** | no | **HIGH** | YES (separate endpoint) |
| **status** | string | **NO** | **NO** | no | **HIGH** | NO |
| **original_language** | string (ISO 639-1) | **NO** | **NO** | no | **HIGH** | NO |
| **in_production** | boolean (TV) | **NO** | **NO** | no | **HIGH** | NO |
| **last_air_date** | string (TV) | **NO** | **NO** | no | **HIGH** | NO |
| **external_ids.tvdb_id** | number | **NO** | **NO** | YES → Sonarr, TVMaze | high | YES (append_to_response) |
| budget | number | NO | NO | no | medium | NO |
| revenue | number | NO | NO | no | medium | NO |
| adult | boolean | NO | NO | no | medium | NO |

**Note:** `budget` and `revenue` return `0` (not null) when data is unavailable. Filter logic must treat 0 as missing. Adding `external_ids` to the existing `append_to_response` costs zero extra HTTP calls and unlocks the TVDB join key for TV shows.

---

## Provider: OMDB

Source: OMDB enrichment via `omdbProvider.ts` — queried by title+year (should use imdbId for accuracy).  
**Rate limit: 1,000 requests/day on free tier.** Enrichment must be batched, not per-automation-tick.

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Extra call? |
|---|---|---|---|---|---|---|
| imdbID | string | YES (raw) | NO | YES → TMDB imdb_id | high | NO |
| imdbRating | number | YES | **NO** | no | **HIGH** | NO |
| imdbVotes | number | YES | NO | no | high | NO |
| rottenTomatoesRating | number | YES | **NO** | no | **HIGH** | NO |
| metacriticRating | number | YES | **NO** | no | **HIGH** | NO |
| awardWinner | boolean (derived) | YES | **NO** | no | **HIGH** | NO |
| oscarWinner | boolean (derived) | YES | **NO** | no | **HIGH** | NO |
| director | string | YES | NO | no | medium | NO |
| actors | string | YES | NO | no | medium | NO |
| language | string | YES | NO | no | medium | NO |
| boxOffice | number | YES | NO | no | medium | NO |
| **Rated** | string (e.g. "PG-13", "R") | **NO** | **NO** | no | **HIGH** | NO |
| Released | string | NO | NO | no | medium | NO |
| totalSeasons | string (series) | NO | NO | no | medium | NO |

**All OMDB fields above are fetched in a single request — zero extra HTTP calls needed.** Using `?i=<imdbId>` instead of `?t=<title>&y=<year>` gives exact matches and avoids title ambiguity. TMDB `imdb_id` (movies) provides the lookup key already.

---

## Provider: TVMaze

Source: TVMaze enrichment via `tvmazeProvider.ts` — queried by series title search.

| Field name | JS type | Currently fetched? | Currently filterable? | Join key | Filter potential | Extra call? |
|---|---|---|---|---|---|---|
| id | number | YES | NO | no | low | NO |
| genres | string[] | YES | **NO** | no | **HIGH** | NO |
| status | string ("Running"/"Ended"/"To Be Determined") | YES | **NO** | no | **HIGH** | NO |
| rating.average | number | YES | **NO** | no | **HIGH** | NO |
| network.name | string | YES | **NO** | no | **HIGH** | NO |
| network.country.name | string | YES | NO | no | medium | NO |
| language | string | YES | NO | no | medium | NO |
| premiered | string | YES | NO | no | high | NO |
| externals.thetvdb | number | YES (in type) | NO | YES → Sonarr tvdbId | high | NO |
| externals.imdb | string | YES (in type) | NO | YES → OMDB | high | NO |
| externals.tvrage | number | YES (legacy) | NO | no | low | NO |
| **type** | string ("Scripted"/"Reality"/"Animation") | **NO** | **NO** | no | **HIGH** | NO |
| **ended** | string (ISO date) | **NO** | **NO** | no | **HIGH** | NO |
| **webChannel** | object {id,name,country} | **NO** | **NO** | no | **HIGH** | NO |
| averageRuntime | number (minutes) | NO | NO | no | medium | NO |
| weight | number (0–100) | NO | NO | no | medium | NO |

**All high-value missing fields are in the base `/search/shows` response — zero extra HTTP calls.** `webChannel` is the key field distinguishing streaming originals (Netflix, Prime, Apple TV+) from broadcast.

---

## Summary: Fields fetched but not filterable (Tier 1 candidates — lowest friction)

These are in the API response, mapped in Warden's types, but have no filter branch. Adding them requires only new fields in `QueryFilters`/filter interfaces, new branches in filter functions, and new UI controls.

| Field | Provider | Current type | Recommended predicate | Operators |
|---|---|---|---|---|
| `monitored` | Radarr | boolean | `monitored` | eq |
| `watched_status` | Tautulli | number (0/1) | `tautulliWatched` (extend existing) | eq |
| `duration` | Tautulli | number (seconds) | `tautulliWatchDuration` | gte, lte |
| `rating_key` | Tautulli | string | (join key — enable Plex bridge) | — |
| `vote_average` | TMDB | number | `tmdbRating` | gte, lte |
| `popularity` | TMDB | number | `tmdbPopularity` | gte, lte |
| `imdbRating` | OMDB | number | `imdbRating` | gte, lte |
| `rottenTomatoesRating` | OMDB | number | `rtRating` | gte, lte |
| `metacriticRating` | OMDB | number | `metacriticRating` | gte, lte |
| `awardWinner` | OMDB | boolean | `awardWinner` | eq |
| `oscarWinner` | OMDB | boolean | `oscarWinner` | eq |
| `status` | TVMaze | string | `tvmazeStatus` | eq, in |
| `rating.average` | TVMaze | number | `tvmazeRating` | gte, lte |
| `genres` | TVMaze | string[] | `tvmazeGenres` | in |
| `network.name` | TVMaze | string | `tvmazeNetwork` | eq, in |
| `streaming.*` | TMDB | boolean×8 | `onNetflix`, `onPrime`, etc. | eq |
| `certification` | TMDB | string | `tmdbCertification` | eq, in |

---

## Summary: Fields in API but not fetched (require provider type extension)

These require adding fields to the provider TypeScript types and fetching them — still Tier 1 (no join needed) but require a code change in the provider layer first.

| Field | Provider | Add to type | Filter potential |
|---|---|---|---|
| `added` | Radarr, Sonarr | RadarrMovie, SonarrSeries | **HIGH** |
| `sizeOnDisk` | Radarr, Sonarr | RadarrMovie, SonarrSeries (via statistics) | **HIGH** |
| `certification` | Radarr, Sonarr | RadarrMovie, SonarrSeries | **HIGH** |
| `ratings` | Radarr, Sonarr | RadarrMovie, SonarrSeries | **HIGH** |
| `popularity` | Radarr | RadarrMovie | **HIGH** |
| `ended` | Sonarr | SonarrSeries | **HIGH** |
| `previousAiring` / `lastAired` | Sonarr | SonarrSeries | **HIGH** |
| `statistics.percentOfEpisodes` | Sonarr | SonarrSeries | **HIGH** |
| `tmdbId` | Sonarr | SonarrSeries (in live response, not in type) | join key |
| `imdbId` | Radarr, Sonarr | RadarrMovie, SonarrSeries | join key |
| `tvMazeId` | Sonarr | SonarrSeries | join key |
| `status` (movie) | Radarr | RadarrMovie | **HIGH** |
| `runtime` | Radarr, Sonarr | both | medium |
| `studio` | Radarr | RadarrMovie | medium |
| UserData.Played, PlayCount, LastPlayedDate, IsFavorite | Jellyfin | JellyfinItem | **HIGH** |
| OfficialRating, CommunityRating, Tags, Genres, DateCreated | Jellyfin | JellyfinItem | **HIGH** |
| ProviderIds | Jellyfin | JellyfinItem | join key |
| viewCount, lastViewedAt, addedAt, contentRating | Plex | PlexMediaItem | **HIGH** |
| guid / guids | Plex | PlexMediaItem | join key |
| play_count, last_played | Tautulli | new type (get_library_media_info) | **HIGH** |
| mediaInfo.status, mediaInfo.issues | Seerr | SeerrSearchResult (retype from unknown) | **HIGH** |
| request.status (filter) | Seerr | exists in type, add filter branch | **HIGH** |
| Rated | OMDB | OmdbEnrichment | **HIGH** |
| status, original_language, in_production, last_air_date | TMDB | TmdbEnrichment | **HIGH** |
| type, ended, webChannel | TVMaze | TvMazeShow | **HIGH** |

---

## Cross-provider join keys available

| From | Key field | To | To field | Reliability |
|---|---|---|---|---|
| Radarr | tmdbId | TMDB | id | HIGH — exact integer match |
| Radarr | tmdbId | Overseerr | mediaInfo.tmdbId | HIGH |
| Radarr | imdbId | OMDB | imdbID | HIGH (use `?i=` param) |
| Sonarr | tvdbId | TVMaze | externals.thetvdb | HIGH — exact integer match |
| Sonarr | tmdbId (add to type) | TMDB | id | HIGH |
| Sonarr | imdbId | OMDB | imdbID | HIGH |
| Sonarr | tvMazeId (add to type) | TVMaze | id | HIGH |
| Tautulli | rating_key | Plex | ratingKey | HIGH — same value |
| Plex | guids[tmdb://X] | Radarr | tmdbId | HIGH after parsing |
| Plex | guids[thetvdb://X] | Sonarr | tvdbId | HIGH after parsing |
| Plex | guids[imdb://X] | OMDB | imdbID | HIGH after parsing |
| Overseerr | mediaInfo.tmdbId | Radarr | tmdbId | HIGH |
| Overseerr | mediaInfo.externalServiceId | Radarr/Sonarr | id | HIGH — direct record ID |
| Overseerr (Seerr) | mediaInfo.jellyfinMediaId | Jellyfin | Id | HIGH |
| Jellyfin | ProviderIds.Tmdb | TMDB/Radarr | tmdbId | HIGH |
| Jellyfin | ProviderIds.Tvdb | Sonarr/TVMaze | tvdbId | HIGH |
| TMDB | imdb_id (movie) | OMDB | imdbID | HIGH — same ID |
| TMDB | external_ids.tvdb_id (TV) | Sonarr | tvdbId | HIGH (requires append_to_response) |
| TVMaze | externals.thetvdb | Sonarr | tvdbId | HIGH |

**Current join chains in Warden:**
- Radarr → TMDB (via tmdbId) ✓
- Radarr/Sonarr → Tautulli (via title string) ✓ (fragile — title normalisation only)

**Join chains not yet implemented:**
- Tautulli → Plex (via rating_key) → Radarr/Sonarr (via Plex guids)
- Radarr → OMDB (via imdbId)
- Sonarr → TVMaze (via tvdbId or tvMazeId)
- Sonarr → TMDB (tvdbId not in Sonarr type yet)
- Overseerr → Radarr/Sonarr (via externalServiceId or tmdbId)
- Jellyfin → Radarr/Sonarr (via ProviderIds.Tmdb/Tvdb)

---

## Gap analysis: `mediaEnrichment` table vs Tier 2 requirements

**The `mediaEnrichment` table does not exist in the current schema.** It must be designed from scratch.

When built, it should store enrichment data keyed on `(mediaItemId, providerType)` or a flat row keyed on `tmdbId` / `tvdbId`. Minimum columns needed to support Tier 2 predicates:

| Column | Type | Source | Tier 2 predicate it enables |
|---|---|---|---|
| tmdbId | integer | join key | all TMDB/Overseerr joins |
| tvdbId | integer | join key | Sonarr/TVMaze joins |
| imdbId | text | join key | OMDB joins |
| tautulliPlayCount | integer | Tautulli get_library_media_info | tautulliPlayCount gte/lte |
| tautulliLastPlayed | integer (Unix ts) | Tautulli get_library_media_info | tautulliLastPlayedDaysAgo |
| plexViewCount | integer | Plex /library/sections/:key/all | plexViewCount gte/lte |
| plexLastViewedAt | integer (Unix ts) | Plex /library/sections/:key/all | plexLastViewedDaysAgo |
| plexContentRating | text | Plex /library/sections/:key/all | plexContentRating eq/in |
| jellyfinPlayed | integer (boolean) | Jellyfin UserData.Played | jellyfinWatched |
| jellyfinPlayCount | integer | Jellyfin UserData.PlayCount | jellyfinPlayCount |
| jellyfinLastPlayedDate | text (ISO) | Jellyfin UserData.LastPlayedDate | jellyfinLastPlayedDaysAgo |
| jellyfinIsFavorite | integer (boolean) | Jellyfin UserData.IsFavorite | jellyfinIsFavorite |
| seerrMediaStatus | integer | Seerr mediaInfo.status | seerrStatus eq/in |
| seerrRequestStatus | integer | Seerr request.status | seerrRequestStatus |
| seerrHasIssue | integer (boolean) | Seerr mediaInfo.issues.length > 0 | seerrHasIssue |
| omdbRated | text | OMDB Rated | omdbRated eq/in |
| tmdbVoteAverage | real | TMDB vote_average | tmdbRating gte/lte |
| tmdbPopularity | real | TMDB popularity | tmdbPopularity gte/lte |
| tmdbStatus | text | TMDB status | tmdbStatus eq/in |
| tmdbOriginalLanguage | text | TMDB original_language | tmdbLanguage eq/in |
| tmdbInProduction | integer (boolean) | TMDB in_production (TV) | tmdbInProduction |
| tvmazeStatus | text | TVMaze status | tvmazeStatus eq/in |
| tvmazeType | text | TVMaze type | tvmazeType eq/in |
| tvmazeWebChannel | text | TVMaze webChannel.name | onStreamingService eq |
| enrichedAt | integer (Unix ts) | system | staleness check |

**Streaming flags** (TMDB watch/providers, already fetched but not filterable):
Add boolean columns `onNetflix`, `onPrime`, `onDisney`, `onHulu`, `onApple`, `onHbo`, `onParamount`, `onPeacock`.

---

## Phase 1 predicate shortlist (implement with no architecture change)

Based on this inventory, the 8 Tier 1 predicates with the highest user value and lowest implementation cost:

| Predicate | Source field | Change required | User value |
|---|---|---|---|
| `addedDaysAgo` | Radarr/Sonarr `added` | Add to type + fetch + filter branch + UI | ★★★ |
| `sizeOnDiskGb` | Radarr/Sonarr `statistics.sizeOnDisk` | Add to type + fetch + filter branch + UI | ★★★ |
| `certification` | Radarr/Sonarr `certification` | Add to type + fetch + filter branch + UI | ★★★ |
| `radarrRating` | Radarr `ratings.imdb.value` | Add to type + fetch + filter branch + UI | ★★★ |
| `sonarrRating` | Sonarr `ratings.value` | Add to type + fetch + filter branch + UI | ★★★ |
| `sonarrEnded` | Sonarr `ended` | Add to type + fetch + filter branch + UI | ★★★ |
| `sonarrLastAiredDaysAgo` | Sonarr `previousAiring`/`lastAired` | Add to type + fetch + derived compute + UI | ★★★ |
| `sonarrPercentEpisodes` | Sonarr `statistics.percentOfEpisodes` | Add to type + fetch + filter branch + UI | ★★★ |

These 8 require no new API calls, no joins, no schema changes — only type extensions, filter branches, and UI controls.

---

## Identity graph design — the prerequisite for all Tier 2 filters

### The actual problem

Every cross-provider join in Warden currently falls back to title-string matching. The `watchedTitleMatching.ts` comment states this as a fixed constraint: *"Tautulli's get_history endpoint does not expose external IDs, so matching must be title-based."* That comment is wrong about root cause.

Tautulli exposes `rating_key` on every history item. That key is identical to Plex's `ratingKey`. Plex exposes a `guids` array on every library item containing `imdb://tt...`, `tmdb://12345`, `thetvdb://67890`. Those IDs map directly to Radarr `imdbId`/`tmdbId` and Sonarr `tvdbId`. The full identity chain exists — it has never been traversed.

The same pattern repeats across every provider. Radarr already returns `tmdbId` and `imdbId` in its `/api/v3/movie` response. Sonarr returns `tvdbId`, `tmdbId`, `imdbId`, and `tvMazeId`. None of these are mapped into Warden's TypeScript types. The enrichment providers (TMDB, OMDB, TVMaze) are called with title+year only, even though exact IDs are sitting in the primary source data unused.

Title matching will always fail on: alternate regional titles, non-English content, sequels with identical names, shows with trailing year disambiguation, and any title where Radarr/Sonarr chose a different canonical string than the watch history provider.

### The search page as a graph discovery tool

`/search?title=X` fan-outs to all configured providers and returns their raw JSON side-by-side in the UI. This is the only place in Warden where a user can visually compare what ID each provider returns for the same title. The page is also scrapable HTML — a playwright agent querying it for a representative set of titles would reveal the complete field-level ID shapes without needing direct API credentials.

The discovery exercise confirms: every provider already embeds at least one durable ID that could serve as a join key. The search page is the proof. The missing step is extracting those IDs into a structured identity registry.

### The latent identity graph

```
Radarr movie
  └─ tmdbId ────────────────────────────────► TMDB /movie/{id}
  └─ imdbId ─────────────────────────────────► OMDB /?i={imdbId}
  └─ imdbId ─────────────────────────────────► Plex guids[imdb://...]
  └─ tmdbId ──────────────────────────────────► Plex guids[tmdb://...]
  └─ tmdbId ──────────────────────────────────► Overseerr mediaInfo.tmdbId
  └─ id (Radarr record) ──────────────────────► Overseerr mediaInfo.externalServiceId

Sonarr series
  └─ tvdbId ─────────────────────────────────► TVMaze /lookup/shows?thetvdb={id}  [free, no key]
  └─ tvdbId ─────────────────────────────────► TMDB /find/{id}?external_source=tvdb_id
  └─ tmdbId (once resolved) ─────────────────► TMDB /tv/{id}
  └─ imdbId ─────────────────────────────────► OMDB /?i={imdbId}
  └─ tvMazeId ────────────────────────────────► TVMaze /shows/{id}  [exact, no search]
  └─ tvdbId ──────────────────────────────────► Plex guids[thetvdb://...]
  └─ tmdbId ──────────────────────────────────► Overseerr mediaInfo.tmdbId

Tautulli history item
  └─ rating_key ─────────────────────────────► Plex /library/metadata/{ratingKey}
                                                  └─ guids[tmdb://...] ─► Radarr tmdbId
                                                  └─ guids[thetvdb://...] ► Sonarr tvdbId

Plex library item
  └─ guids[tmdb://X] ─────────────────────────► Radarr tmdbId
  └─ guids[thetvdb://X] ──────────────────────► Sonarr tvdbId
  └─ ratingKey ───────────────────────────────► Tautulli rating_key

Jellyfin library item
  └─ ProviderIds.Tmdb ────────────────────────► Radarr tmdbId / TMDB /movie/{id}
  └─ ProviderIds.Tvdb ────────────────────────► Sonarr tvdbId / TVMaze
  └─ ProviderIds.Imdb ────────────────────────► OMDB

Overseerr request
  └─ mediaInfo.tmdbId ────────────────────────► Radarr tmdbId
  └─ mediaInfo.externalServiceId ─────────────► Radarr/Sonarr record id (direct FK)
  └─ mediaInfo.tvdbId ────────────────────────► Sonarr tvdbId
```

### Free APIs that close remaining gaps

All of these are free, no-key or free-tier:

| Gap | API call | Cost |
|---|---|---|
| Sonarr tvdbId → tmdbId | `api.themoviedb.org/3/find/{tvdbId}?external_source=tvdb_id&api_key=X` | Free, counts against TMDB quota (~40 req/sec, no daily cap) |
| Sonarr tvdbId → TVMaze id | `api.tvmaze.com/lookup/shows?thetvdb={tvdbId}` | Free, no key, 2 req/sec |
| Radarr/Sonarr imdbId → OMDB | `omdbapi.com/?i={imdbId}&apikey=X` | Free tier 1,000/day — use imdbId not title |
| Sonarr imdbId (missing) | `api.tvmaze.com/lookup/shows?imdb={imdbId}` | Free, no key |
| TMDB TV imdbId (for OMDB) | `api.themoviedb.org/3/tv/{tmdbId}?append_to_response=external_ids` | Free, zero extra HTTP cost if bundled with existing enrichment call |
| Plex guids → tmdbId/tvdbId | `plex.tv/library/sections/:key/all` with `guids` field requested | No external API — Plex itself, already authed |

**OMDB rate limit is the binding constraint.** At 1,000 req/day free, a library of 2,000 movies exhausts the quota in 2 days. Mitigations:
1. Use `?i=<imdbId>` (exact, no false matches) — never waste a quota hit on a wrong title
2. Cache aggressively — OMDB data doesn't change frequently
3. Prioritise enriching items that are candidates for automation (have a matching include filter) over the full library

### Proposed `mediaIdentity` table (prerequisite for `mediaEnrichment`)

The `mediaEnrichment` table described in QUERIES.md cannot be keyed correctly without first resolving the identity graph. Split into two tables:

**`media_identity`** — the canonical ID set per Warden media item. Populated at Radarr/Sonarr sync time.

```sql
CREATE TABLE media_identity (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Warden-canonical source
  sourceType      TEXT NOT NULL,   -- 'RADARR' | 'SONARR'
  sourceId        INTEGER NOT NULL, -- Radarr movie id or Sonarr series id
  -- Cross-provider IDs
  tmdbId          INTEGER,
  imdbId          TEXT,
  tvdbId          INTEGER,
  tvMazeId        INTEGER,
  plexRatingKey   TEXT,            -- populated when Plex is configured
  jellyfinItemId  TEXT,            -- populated when Jellyfin is configured
  -- Staleness
  resolvedAt      INTEGER,         -- Unix ts of last ID resolution pass
  UNIQUE(sourceType, sourceId)
);
CREATE INDEX idx_media_identity_tmdb ON media_identity(tmdbId);
CREATE INDEX idx_media_identity_tvdb ON media_identity(tvdbId);
CREATE INDEX idx_media_identity_imdb ON media_identity(imdbId);
```

**`media_enrichment`** — the fetched data keyed on `media_identity.id`.

The enrichment columns from the gap analysis section above key against `mediaIdentityId` (FK to `media_identity.id`), not directly against tmdbId.

### Identity resolution algorithm

**Phase A — Radarr movies (runs at Radarr sync, near-zero cost):**
1. For each Radarr movie: extract `tmdbId` and `imdbId` from the API response (both already present, just not typed)
2. Upsert into `media_identity(sourceType='RADARR', sourceId=radarr.id, tmdbId=..., imdbId=...)`
3. No external API calls needed — all IDs are in the Radarr response

**Phase B — Sonarr series (runs at Sonarr sync, near-zero cost):**
1. For each Sonarr series: extract `tvdbId` (already typed), `tmdbId`, `imdbId`, `tvMazeId` from the API response (in live response, not typed yet)
2. Upsert into `media_identity(sourceType='SONARR', sourceId=sonarr.id, tvdbId=..., tmdbId=..., imdbId=..., tvMazeId=...)`
3. For any series where `tmdbId` is null after step 2: call TMDB `/find/{tvdbId}?external_source=tvdb_id` to resolve it
4. For any series where `tvMazeId` is null: call TVMaze `/lookup/shows?thetvdb={tvdbId}` (free)

**Phase C — Plex bridge (runs on a slower schedule, or on-demand when Plex filter is used):**
1. For each Plex library item: fetch `guids` array
2. Parse `tmdb://X` → look up `media_identity` by `tmdbId=X` → set `plexRatingKey`
3. Parse `thetvdb://X` → look up `media_identity` by `tvdbId=X` → set `plexRatingKey`
4. This resolves both the Plex→Radarr/Sonarr join AND the Tautulli→everything join (via rating_key)

**Phase D — Jellyfin bridge (same cadence as Plex):**
1. For each Jellyfin library item: fetch `ProviderIds` object
2. `ProviderIds.Tmdb` → look up by `tmdbId` → set `jellyfinItemId`
3. `ProviderIds.Tvdb` → look up by `tvdbId` → set `jellyfinItemId`

### What changes in the enrichment pipeline

With `media_identity` populated, every enrichment call becomes ID-based, not title-based:

| Enrichment | Old approach | New approach |
|---|---|---|
| TMDB ratings/metadata | `searchByTitle(title, year)` — may match wrong film | `getMovieById(tmdbId)` / `getTvById(tmdbId)` — exact |
| OMDB ratings | `getRatings(title, year)` — 1,000/day quota wasted on mismatches | `getById(imdbId)` — exact, no wasted calls |
| TVMaze status/type | `searchShows(title)` — takes first result | `getShow(tvMazeId)` — exact |
| Tautulli watch history | title normalisation match | `rating_key` → `plexRatingKey` in `media_identity` → exact set membership |
| Plex viewCount/lastViewedAt | not implemented | `ratingKey` join via `media_identity.plexRatingKey` |
| Overseerr availability | not implemented | `tmdbId` join via `media_identity.tmdbId` |
| Jellyfin watch status | not implemented | `jellyfinItemId` join via `media_identity.jellyfinItemId` |

### Impact on `watchedTitleMatching.ts`

The title-matching module becomes an interim fallback only, used when Plex is not configured. When Plex is configured and `media_identity.plexRatingKey` is populated, the `tautulliWatched` filter should:
1. Query Tautulli `get_library_media_info` for `play_count` and `last_played` keyed on `rating_key`
2. Join via `media_identity.plexRatingKey` = Tautulli `rating_key`
3. Apply the filter on the joined integer (`play_count > 0`) not on a fuzzy title string

### Revised Phase 2 scope

Phase 2 in QUERIES.md must now include identity resolution as its **first deliverable**, before any enrichment data is fetched:

1. Add `tmdbId`, `imdbId` to `RadarrMovie` type (they're in the API response now)
2. Add `tmdbId`, `imdbId`, `tvMazeId` to `SonarrSeries` type (same)
3. Add `guids` to `PlexMediaItem` type
4. Add `ProviderIds` to `JellyfinItem` type
5. Create `media_identity` table + migration
6. Build identity resolution job (runs after Radarr/Sonarr sync)
7. Build Plex/Jellyfin bridge step
8. Only then: build `media_enrichment` table and the data-fetching enrichment job
9. Only then: add Tier 2 filter branches that join against enrichment data

Without steps 1–7, steps 8–9 are unreliable for the same reason title matching is unreliable.
