# Plex — API surface audit

Enumeration only (per ticket constraint) — no curation, no precedence resolution. Plex Media
Server (PMS) has no official public API; this is reverse-engineered/community-documented
(`python-plexapi`, plexapi.dev, Plexopedia, support.plex.tv). Two distinct services are in scope:
**PMS** (the local server, token via `X-Plex-Token`) and **plex.tv** (the cloud account service,
already partially used by `PlexService` for auth).

Legend: **Wired** = already implemented and reachable in this codebase. **Not wired** = found in
Plex's API but absent here; layers it would touch are listed using the map's vocabulary (db/config,
provider field, UI filter, query engine, enrichment, task/actuator, automation).

## Already wired

| Item | Where |
|---|---|
| `getLibraries()` (`library/sections`) | `server/modules/providers/connections/plexProvider.ts:70-75` |
| `getLibraryContents(libraryKey)` (`library/sections/{key}/all`) | `plexProvider.ts:77-82` |
| `getAllItems()` (flattens all libraries) | `plexProvider.ts:84-88` |
| Item fields: `ratingKey`, `title`, `type`, `year`, `thumb`, `guids`, `viewCount`, `lastViewedAt`, `addedAt` | `plexProvider.ts:11-21` (`PlexMediaItem`) |
| `playCount` (from `viewCount`) | enrichment field, `mediaFieldProvider.ts:154-174` (`plexFieldProvider`), consumed by `ruleRegistry.ts` `watched`/`lastWatchedDaysAgo` rules |
| `lastWatchedAt` (from `lastViewedAt`) | same as above |
| `plexAddedAt` (from `addedAt`, library-added timestamp, ISO-converted) | `mediaFieldProvider.ts:170-173`; filter rule `plexAddedDaysAgo` in `ruleRegistry.ts:178-190`; schema column added in `server/database/migrations/0017_plex_added_at.sql` |
| Auth / user identity (`plex.tv/api/v2/user`) | `server/modules/providers/plexService.ts` — `PlexService.getUserByToken` (id, email, username, thumb) — used for login, not media enrichment |
| Task: `deleteFromLibrary` (`DELETE library/metadata/{key}`) | `plexProvider.ts:91-97`, actuator task `deleteFromLibrary` |
| Task: `refreshMetadata` (`PUT library/metadata/{key}/refresh`) | `plexProvider.ts:99-105`, actuator task `refreshMetadata` |
| Task: `markPlayed` (`GET :/scrobble`) | `plexProvider.ts:107-109, 115-120`, actuator task `markPlayed` |
| Task: `markUnplayed` (`GET :/unscrobble`) | `plexProvider.ts:111-120`, actuator task `markUnplayed` |
| Identity stamping (`plexRatingKey` matching via `runForPlex`) | per `docs/architecture/media-providers.md` — Plex never inserts an identity group of its own, only stamps existing ones |

Note: `docs/architecture/media-providers.md` (lines 92-95) lists a `moveToTrash` actuator task on
Plex that does **not** exist in the current `plexProvider.ts` (`tasks()` returns exactly 4: delete,
refresh, markPlayed, markUnplayed). This is a doc/code drift outside this ticket's scope to fix, but
flagged here since it's directly adjacent to the actuator surface being audited.

## Not wired — per-item library metadata fields

All found in the `/library/sections/{key}/all` and `/library/metadata/{ratingKey}` response
(`Video`/`Directory` metadata objects), i.e. the *same endpoints already being called* — these are
fields on the existing response payload the codebase currently discards, not new endpoints.

| Field | Description | Layers touched |
|---|---|---|
| `summary` | Plot synopsis | provider field, enrichment, UI filter (probably not filterable — display-only), query engine (display) |
| `tagline` | Marketing tagline | provider field, enrichment, display only |
| `studio` | Production studio | provider field, enrichment, UI filter, query engine — **naming-collision risk**: no existing `studio` field in `ruleRegistry.ts`, but conceptually adjacent to a future TMDB/OMDB "production company" field |
| `contentRating` | Plex's own content rating (e.g. `TV-MA`, `PG-13`) | provider field, enrichment, UI filter, query engine — **naming-collision risk**: `ruleRegistry.ts` already has a `certification` rule sourced from Radarr/Sonarr/TMDB/OMDB; Plex's `contentRating` is the same concept, different field name and possibly different rating-board string format (Plex mirrors source metadata agent's rating, may differ from Radarr/Sonarr's `certification` value for the same title) — flagged, not resolved |
| `rating` | Plex's own critic/audience-style rating (source varies by metadata agent) | provider field, enrichment, UI filter, query engine — **naming-collision risk**: distinct from `imdbRating` (movie-only, Radarr-sourced) and from TMDB/OMDB's own rating fields; Plex's `rating` provenance is opaque (whatever the configured metadata agent supplied) |
| `audienceRating` | Separate audience-score field (Plex splits critic vs audience rating for some agents) | same as `rating` — same collision family |
| `duration` | Runtime, milliseconds | provider field, enrichment, UI filter (e.g. "Runtime" range rule), query engine — **naming-collision risk**: none currently in `ruleRegistry.ts`, but would be a new range rule alongside `sizeOnDiskGb` |
| `originallyAvailableAt` | Release date | provider field, enrichment, UI filter, query engine — **naming-collision risk**: distinct from `year` (already wired, Plex-sourced) and from `addedDate`/`plexAddedAt` (library-entry timestamps, not release dates) — three different "date" concepts already in play, a fourth (`originallyAvailableAt`) would need a clearly distinct name |
| `Genre` tags (array on the metadata object) | Genre tag list | provider field, enrichment, UI filter, query engine — **naming-collision risk**: `ruleRegistry.ts` already has a `genres` rule (Radarr for movies, Sonarr+TMDB for shows); adding Plex as a third/fourth source needs precedence handling |
| `Media`/`Part` sub-objects (container, videoResolution, audioChannels, file path, size in bytes) | Technical file metadata | provider field, enrichment, UI filter, query engine — **naming-collision risk**: `sizeOnDiskGb` already exists (Radarr/Sonarr-sourced); a Plex-derived file-size field would collide in concept (same title, potentially different byte count depending on which system's view is current) |
| `Label` tags (user-applied labels, distinct from `Genre`) | Free-text/user-defined tags | provider field, enrichment, UI filter, query engine — **naming-collision risk**: `tagIds` rule exists (Radarr/Sonarr numeric tag ids); Plex labels are strings, not the same id space — collision is conceptual (both called "tags"/"labels") not literal key collision |
| `guid` (Plex's own metadata agent GUID, distinct from the `guids` array already pulled) | Primary external ID | Already partially pulled (`guids` array exists on `PlexMediaItem` per line 17) but not confirmed consumed anywhere in identity/enrichment code beyond the type declaration — worth verifying whether `guids` is actually read downstream or just declared |

## Not wired — collections, labels, playlists

| Item | Description | Layers touched |
|---|---|---|
| Collections (`/library/collections`, `Collection` metadata objects with a `subtype` and nested `Label` list) | Curated groupings of items, movie/show/artist/album scoped | db/config (new relation: item-to-collection is many-to-many, likely structural), provider field, UI filter (e.g. "in collection X"), query engine, enrichment. **Structural schema gap**: collection membership is not a scalar field on an item — would need a join table, not a `settings` JSON value |
| Labels (as attached to collections or directly to items) | User-curated string tags | same shape concern as item-level `Label` above — likely needs its own table if many-valued per item |
| Playlists (`/playlists/{id}/items`) | User-curated ordered lists, can mix movies/episodes | db/config (structural — ordered many-to-many), provider field, UI filter, query engine. Not currently modeled anywhere in this codebase for any provider |

## Not wired — sessions / now playing

| Item | Description | Layers touched |
|---|---|---|
| `GET /status/sessions` — active playback sessions | Real-time "who's watching what right now," including player/user/progress | provider field (new: not a static per-item field, a live/transient one), UI filter (arguably not filterable in the static sense — more of a dashboard/live-view feature), enrichment (would need a different refresh cadence — near-real-time, not batch), task/actuator (Plex also exposes session-control actions like terminating a stream — Tautulli's `terminateStream` task, per `docs/architecture/media-providers.md`, is the closer analog and is itself only modelled-only today), automation (e.g. "notify when X starts playing" — a genuinely new automation trigger *type*, not just a new task) |

## Not wired — Plex Home / multi-user

| Item | Description | Layers touched |
|---|---|---|
| `GET https://plex.tv/api/v2/home/users` — list Plex Home / managed users | Enumerates all users under one Plex Home | db/config (structural — new entity, "Plex user," not currently modeled at all), provider field, UI filter (e.g. filter by which user watched it), enrichment, task/actuator. **Structural schema gap**: `playCount`/`lastWatchedAt` today are single scalars per item — multi-user watch data would need a per-(item, user) table, a materially different shape than current EAV `media_enrichment` rows keyed by item alone. Also **known API limitation** (per community reports): PMS/plex.tv watch-status endpoints have historically conflated managed-user watch state with the owner's — flagged as a research-time caveat, not just a gap |

## Not wired — webhooks (push vs poll)

| Item | Description | Layers touched |
|---|---|---|
| PMS webhooks (Plex Pass feature; server-configured POST on playback/library events: `media.play`, `media.pause`, `media.resume`, `media.stop`, `media.scrobble`, `media.rate`, `library.new`, `admin.database.backup`, `admin.database.corrupted`, `device.new`, etc.) | Push-based event delivery, alternative to this codebase's current poll-only model | db/config (new inbound webhook receiver endpoint/route — structural, not just settings), automation (this is the biggest single gap: every current automation trigger in this codebase is presumably schedule/poll-based against `MediaActuator` tasks; a webhook receiver would be a new automation trigger *class*, "event-driven" vs "scheduled") — **requires Plex Pass**, a licensing gate worth flagging since it's not universally available to every configured instance |

## Not wired — library/server maintenance actions

| Item | Description | Layers touched |
|---|---|---|
| `GET /library/sections/all/refresh` — scan/refresh all libraries at once | Bulk version of the existing single-item `refreshMetadata` task | task/actuator (new task, server-scoped not item-scoped — existing `ActuatorTask.run(ids)` shape assumes item ids; a whole-library action doesn't fit that signature as-is), automation |
| `GET /library/sections/{key}/refresh` — scan one library | Same, section-scoped | task/actuator, automation |
| Empty Trash (per-library) | Permanently removes items already soft-deleted from a library | task/actuator, automation — **destructive**, same class as existing `deleteFromLibrary` |
| Optimize Database (`clean bundles`, DB vacuum-equivalent) | Server maintenance, not media-item-scoped at all | task/actuator (server-scoped, not item- or even library-scoped — a third distinct action shape alongside item-scoped and library-scoped) |

## Not wired — plex.tv Discover / Universal Watchlist

| Item | Description | Layers touched |
|---|---|---|
| `plex.tv` Watchlist (`/library/sections/watchlist/{filter}`, sortable by `watchlistedAt`, `titleSort`, `originallyAvailableAt`, `rating`; filterable by `available`/`released`, `movie`/`show`) | User's cross-service "want to watch" list, separate from anything on the local PMS | db/config (structural — new entity, not an item field), provider field, UI filter, query engine, enrichment, task/actuator (add/remove from watchlist), automation (e.g. "auto-request watchlist items via Overseerr" — a plausible cross-provider automation, entirely new territory) — **separate auth/base URL** from PMS (`plex.tv`, already how `PlexService` authenticates, but watchlist itself is unused) |

## Summary of naming-collision risks flagged (not resolved)

1. `contentRating` (Plex) vs `certification` (existing rule, Radarr/Sonarr/TMDB/OMDB) — same concept, different field name/format.
2. `rating`/`audienceRating` (Plex) vs `imdbRating` (existing, Radarr-only) — multiple "rating" concepts from different providers with different scales/provenance.
3. `Genre` (Plex) vs `genres` (existing rule, Sonarr/TMDB for shows, Radarr for movies) — would add Plex as another genre source, precedence undecided.
4. File size/`Media.Part` byte size (Plex) vs `sizeOnDiskGb` (existing, Radarr/Sonarr) — same concept, potentially different values.
5. `Label` (Plex, string-valued, user-defined) vs `tagIds` (existing, Radarr/Sonarr numeric ids) — both called "tags" conceptually, incompatible id spaces.
6. `originallyAvailableAt` (Plex, release date) vs `year` (existing, already Plex-sourced) vs `addedDate`/`plexAddedAt` (library-entry dates) — three-to-four distinct "date" concepts already in play; a new release-date field needs an unambiguous name.
7. Confirmed **not** a collision per ticket's known context: `plexAddedAt` (library-added-to-Plex) vs Radarr/Sonarr's `addedAt`-family (`addedDate`, "added to source") are already distinctly named and wired — re-verified during this audit, no drift found.

## Summary of structural schema gaps flagged (not designed)

1. **Collections** — many-to-many item-to-collection membership; not expressible as a scalar `EnrichmentFields` value or a `settings` JSON blob entry.
2. **Labels** (as a many-valued per-item tag list) — same shape problem as collections if modeled per-item rather than as a display string.
3. **Playlists** — ordered many-to-many, cross-content-type; nothing analogous exists in the schema today.
4. **Multi-user (Plex Home) watch data** — `playCount`/`lastWatchedAt` are currently single scalars per item in `media_enrichment`; per-user watch state needs a per-(item, user) table, not a new column.
5. **Webhook receiver** — an inbound HTTP endpoint plus event-to-automation-trigger mapping; not a config value, a new subsystem.
6. **plex.tv Watchlist** — an entity with no existing analog (not tied to a PMS library item until matched); would need its own table distinct from `media_identity`/`media_enrichment`.
7. **Server/library-scoped actions** (scan-all, empty trash, optimize DB) — don't fit the existing `ActuatorTask.run(ids: string[])` signature, which assumes item-level targeting; a whole-server or whole-library action is a different task shape, not just a new task id.

## Sources

- [python-plexapi documentation — Video module](https://python-plexapi.readthedocs.io/en/latest/modules/video.html)
- [python-plexapi documentation — Library module](https://python-plexapi.readthedocs.io/en/latest/modules/library.html)
- [python-plexapi documentation — MyPlex module](https://python-plexapi.readthedocs.io/en/latest/modules/myplex.html)
- [python-plexapi documentation — Collection module](https://python-plexapi.readthedocs.io/en/latest/modules/collection.html)
- [plexapi.dev — Get Metadata by RatingKey](https://plexapi.dev/api-reference/library/get-metadata-by-ratingkey)
- [plexapi.dev — Get all media of library](https://plexapi.dev/api-reference/library/get-all-media-of-library)
- [plexapi.dev — List Sessions](https://plexapi.dev/api-reference/sessions/get-active-sessions)
- [Plexopedia — Get Active Sessions](https://www.plexopedia.com/plex-media-server/api/server/sessions/)
- [Plexopedia — Scan All Libraries](https://www.plexopedia.com/plex-media-server/api/library/scan/)
- [Plexopedia — plex.tv Get Users](https://www.plexopedia.com/plex-media-server/api-plextv/users/)
- [Plex Support — Webhooks](https://support.plex.tv/articles/115002267687-webhooks/)
- [Plex Support — Library Actions](https://support.plex.tv/articles/200392106-library-actions/)
- [Plex Support — Scanning vs Refreshing a Library](https://support.plex.tv/articles/200289306-scanning-vs-refreshing-a-library/)
- [Plex Support — Managed Accounts (Plex Home)](https://support.plex.tv/articles/203948776-managed-users/)
- [Plex Support — Universal Watchlist](https://support.plex.tv/articles/universal-watchlist/)
- [Plex Support — Edit Details (per-item metadata fields)](https://support.plex.tv/articles/201272763-edit-details/)
- [Plex Media Server URL Commands](https://support.plex.tv/articles/201638786-plex-media-server-url-commands/)
- [developer.plex.tv — PMS API root](https://developer.plex.tv/pms/)
