# Jellyfin — API surface audit

Fresh audit (no prior gap-analysis doc existed for Jellyfin). Cross-checks Jellyfin's REST/OpenAPI
surface against what this codebase currently wires. Enumeration only — no curation, no collision
resolution.

Sources: Jellyfin's `BaseItemDto` (via `@jellyfin/sdk` TypeScript SDK docs), `UserItemDataDto`/
`UpdateUserItemDataDto`, Sessions API, Collections API (`CollectionController.cs`), Users API,
ScheduledTasks/Library-refresh docs, and this repo's `server/modules/providers/connections/jellyfinProvider.ts`,
`server/modules/providers/providerFactory.ts`, `server/modules/providers/roles.ts`,
`server/modules/providers/identityResolutionJob.ts`, `server/modules/media/actuatorIdResolver.ts`,
`server/database/schema.ts`, `server/modules/media/mediaFieldProvider.ts`,
`server/modules/media/enrichment/enricherAdapters.ts`, `server/modules/media/filterRegistry.ts`,
`src/lib/provider-registry.ts`.

## Wiring status today (summary)

Jellyfin is wired only as:
- A `MediaActuator` (`server/modules/providers/connections/jellyfinProvider.ts`): 5 tasks —
  `deleteItem`, `refreshMetadata`, `markPlayed`, `markUnplayed`, `addToCollection`.
- An identity bridge: `identityResolutionJob.ts:92-109` (`runForJellyfin`) calls `getAllItems()`
  (`Items?recursive=true&fields=ProviderIds&includeItemTypes=Movie,Series`) purely to stamp
  `mediaIdentity.jellyfinItemId` (`server/database/schema.ts:238`) via `ProviderIds` (Tmdb/Tvdb/Imdb
  cross-reference) — no other field from that response is consumed.
- `providerFactory.ts:61-62` constructs it; `identityJobFactory.ts:37,47,53` wires it into the
  identity job's deps.
- `actuatorIdResolver.ts:15` maps `MetadataProviderType.JELLYFIN` -> `mediaIdentity.jellyfinItemId`
  for task-target resolution.
- `src/lib/provider-registry.ts` JELLYFIN entry (`order: 1`, `filterCapabilities: ['Library
  contents', 'Item metadata']`) — but those capabilities are **aspirational**: no filter rule in
  `filterRegistry.ts` currently sources from Jellyfin, and no field in `mediaFieldProvider.ts` or
  `enricherAdapters.ts` is Jellyfin-sourced. Zero hits for "jellyfin" in all three files.
- Jellyfin is **not** a `MediaSource` (`roles.ts:91-93` — only Radarr/Sonarr own catalogs), **not**
  in `ProviderFactory.ProviderSet` (`providerFactory.ts:34-39` — only plex/tautulli/overseerr/tmdb
  get named slots), and **not** in any item's `_sourceIds` (`movie.ts`, `series.ts`,
  `normalizeMedia.ts`) — so even though `JellyfinProvider.getAllItems()` fetches full library
  items, nothing downstream can join a Jellyfin-native field back onto a `NormalizedMovie`/
  `NormalizedSeries` today; there's no `sourceIds.jellyfin` key to key a `MediaFieldProvider` map by.

## Fields — `BaseItemDto` (library item metadata)

Every field below is **not wired** unless marked wired. "Layers" lists what a full wire-up would
touch: db/config, provider field (`mediaFieldProvider.ts` + `enricherAdapters.ts`), UI filter
(`filterRegistry.ts` + `provider-registry.ts` capabilities), query engine (predicate + registry
entry), enrichment (decorate/join), task/actuator, automation option.

| Field | Wired? | Notes / layers touched if not |
|---|---|---|
| `Id` | wired (identity bridge only) | Used only to stamp `jellyfinItemId`. Not exposed as a joinable `_sourceIds.jellyfin` key for enrichment — **structural gap**: adding one is cheap (already have the column) but the join-key plumbing (`_sourceIds` type + `movie.ts`/`series.ts` population) doesn't exist. |
| `ProviderIds` (Tmdb/Tvdb/Imdb) | wired | Consumed in `identityResolutionJob.ts` for identity resolution only. |
| `Name` | not wired | provider field, query engine (would duplicate `title` rule, which already lists Plex — naming-collision-adjacent, see below) |
| `Type` (Movie/Series) | wired (partially) | Used only to filter `JELLYFIN_KIND` mapping in identity job; not exposed as a normalized-item field. |
| `ProductionYear` | not wired | provider field; would duplicate `year` rule (already Plex/Radarr/Sonarr/TMDB-sourced) |
| `Genres` / `GenreItems` | not wired | provider field, UI filter, query engine, enrichment. No existing `genres` rule in `filterRegistry.ts` at all — **new rule needed regardless of provider**. |
| `Studios` | not wired | same as Genres — no existing studio rule anywhere in the registry. |
| `Tags` | not wired | **naming collision risk**: `EnrichmentFields.tags` already exists, sourced from Radarr (movie) / Sonarr (show) as `number[]` (quality-tag ids, `instanceScoped: true`, provider-defined id space). Jellyfin's `Tags` is a `string[]` of free-text labels — same field name, incompatible type and meaning. Flagging, not resolving. |
| `Overview` | not wired | provider field only (no filter use case) |
| `Taglines` | not wired | provider field |
| `OfficialRating` (e.g. "PG-13") | not wired | **naming/semantic collision risk** with `certification` rule (`filterRegistry.ts` `key: 'certification'`), currently sourced from Radarr/Sonarr/TMDB/OMDB. Same concept, different field name today — but a Jellyfin wire-up should presumably feed the *same* `certification` rule rather than mint a new one; flagging the naming/merge question for the precedence ticket. |
| `CommunityRating` | not wired | **naming collision risk** against any future Plex/TMDB "rating" field — TMDB already has its own rating semantics elsewhere (not in `EnrichmentFields` today, but likely to appear). Flag only. |
| `CriticRating` | not wired | provider field |
| `RunTimeTicks` / `CumulativeRunTimeTicks` | not wired | provider field, UI filter (a "runtime" rule doesn't exist yet in the registry at all — new rule). Units gap: Jellyfin ticks (10,000,000 ticks/sec) vs. whatever unit a future runtime rule picks — flag as a units-normalization concern, not just naming. |
| `People` (cast/crew) | not wired | provider field. **Structural schema gap**: no existing table models cast/crew for any provider; this is a new relational shape (one item -> many people), not a scalar column — flag. |
| `DateCreated` | not wired | provider field, UI filter. **Naming collision risk**: conceptually parallels `plexAddedAt` (`EnrichmentFields.plexAddedAt`, its own `plexAddedDaysAgo` rule) and Radarr/Sonarr's `addedDate` (backing the generic `addedDaysAgo` rule per `filterRegistry.ts` comment at line ~504 documenting the `plexAddedDaysAgo`/`addedDaysAgo` mismatch precedent). A `jellyfinAddedAt` would need the same "added-by-whom" disambiguation this repo already got bitten by once (see `filterRegistry.ts` comment near line 504). |
| `DateLastMediaAdded` | not wired | provider field (folder-level, not item-level — different semantics from `DateCreated`) |
| `PremiereDate` | not wired | provider field, UI filter (no existing "premiere/release date" rule distinct from `year`) |
| `Path` | not wired | provider field (useful for de-dup/diagnostics, not filtering) |
| `MediaSources` / `MediaStreams` (codec, resolution, bitrate, container) | not wired | provider field, UI filter. Parallel to Radarr/Sonarr's file-quality data but structurally different shape (nested array of stream objects) — likely needs its own normalization, not a scalar column. |
| `ImageTags` / `BackdropImageTags` | not wired | provider field (artwork — likely out of scope for filtering, relevant only if a "has artwork" style rule is ever wanted) |
| `LockedFields` | not wired | provider field / automation option (Jellyfin-specific "don't auto-refresh this field" — no analogous concept from any other provider) |
| `SeriesId`/`SeriesName`/`SeasonId`/`SeasonName` (episode context) | not wired | Only relevant if per-episode granularity is ever modeled; today the app operates at movie/show level, so this is likely out of scope, flagging for completeness only. |
| `Chapters` | not wired | provider field, likely never a filter target |
| `Container` | not wired | provider field |
| `CollectionType` (library type: movies/tvshows/etc.) | not wired | Returned by `Library/VirtualFolders` (`getLibraries()`), already fetched but only `Name`/`ItemId` are read (`JellyfinLibrary` interface, `jellyfinProvider.ts:5-9`) — `CollectionType` is dropped on the floor today. |

## User-scoped data — `UserItemDataDto` (per-user playback/watch state)

Fetched today only implicitly (not read) — `Users/${userId}/Items` is called for `getLibraryContents`
but the response isn't typed to include `UserData`.

| Field | Wired? | Notes / layers touched if not |
|---|---|---|
| `Played` (boolean watched flag) | not wired | **naming collision risk**: conceptually maps to `EnrichmentFields.playCount > 0` used by the existing `watched` rule (sourced today from Tautulli/Plex `playCount`). Jellyfin's `Played` is a boolean, not a count — a Jellyfin wire-up would need to synthesize a `playCount` (0 or 1, or defer to `PlayCount` field below) to reuse the existing rule, or the rule needs to broaden. Flag only. |
| `PlayCount` | not wired | Same shape as existing `EnrichmentFields.playCount` (Plex/Tautulli-sourced) — likely mergeable, flag as same-name-same-meaning candidate (lower risk than `Tags`/`OfficialRating`, still worth the precedence ticket's attention since three providers would now write the same field). |
| `LastPlayedDate` | not wired | Same shape as `EnrichmentFields.lastWatchedAt` (Plex/Tautulli-sourced) — same mergeable-candidate note as `PlayCount`. |
| `IsFavorite` | not wired | provider field, UI filter (no existing "favorite" rule from any provider) — genuinely new concept, no collision risk. |
| `PlaybackPositionTicks` | not wired | provider field. No existing "in-progress/partially-watched" rule — new concept; also a units gap (ticks) like `RunTimeTicks` above. |
| `Rating` (per-user personal rating, distinct from `CommunityRating`) | not wired | provider field — **naming collision risk** against `CommunityRating` above and any future generic "rating" filter; two Jellyfin fields alone already collide in concept. |

## Sessions API (`GET /Sessions`, now-playing)

Not wired at all — no session/now-playing concept exists anywhere in this codebase for any provider
(Tautulli's `getHistory()` is historical, not live).

| Capability | Wired? | Layers |
|---|---|---|
| `GET /Sessions` — list active sessions, each with `NowPlayingItem` (item currently playing), `UserName`, `DeviceName`, `PlayState` (position, paused) | not wired | **structural schema gap**: this is live/ephemeral state, not a column to add to `media_identity` or `media_item` — if ever wired it likely wants its own non-persisted read-through endpoint rather than a db table. New provider field, new UI surface (not a filter — more like a dashboard widget), no automation-option precedent. |
| Session playback control (pause/stop/seek via `POST /Sessions/{id}/Playing/*`) | not wired | task/actuator (new task category: "control a live session" — different shape from today's item-targeted tasks, which all take `ids: ActuatorTargetId[]`; a session isn't addressed by `jellyfinItemId`). Flag as needing new actuator addressing, not just new tasks. |

## Collections API

Partially wired: only `addToCollection` (`POST /Collections/{collectionId}/Items`) exists as a task
(`jellyfinProvider.ts:59-69`), requiring the collection id as a pre-existing external parameter.

| Capability | Wired? | Layers |
|---|---|---|
| `AddToCollection` (`POST /Collections/{id}/Items`) | wired | `jellyfinProvider.ts` task `addToCollection` |
| `CreateCollection` (`POST /Collections`) | not wired | task/actuator — new task; also needs a way to surface/select "create new" vs. "existing collection id" in the task's `parameter` (today's `ActuatorTaskParameter` is a single free-text/select label, no create-flow precedent) |
| `RemoveFromCollection` (`DELETE /Collections/{id}/Items`) | not wired | task/actuator (natural counterpart to the existing `addToCollection` — no code reason it's missing, likely just unimplemented) |
| Listing collections (to populate the `addToCollection` parameter's picker) | not wired — unclear if `getLibraries()`/`getLibraryContents()` surfaces collections as a special `CollectionType` library. Not confirmed either way; flag for follow-up, not asserting a gap. |

## Users API

Not wired beyond reading a single configured `userId` out of `provider.settings.userId`
(`jellyfinProvider.ts:77-80`, `providers.schemas.ts:13` documents the settings-blob shape).

| Capability | Wired? | Layers |
|---|---|---|
| `GET /Users` — list all server users | not wired | provider field / config surface. Today the app hardcodes one Jellyfin user per configured instance (`settings.userId`, a single string in the JSON settings blob) — multi-user watch-state (e.g. "watched by user X") is **not representable** without a structural change: `mediaIdentity`/`media_item` has no per-user dimension at all. **Structural schema gap**: any per-user filter (watched-by-specific-user, favorited-by-specific-user) needs a new user-scoped table/column, not a settings-blob tweak. |
| `POST /Users/New`, policy management | not wired | out of this app's apparent scope (user provisioning, not media filtering) — flagging for completeness only. |

## Library scan / refresh tasks

| Capability | Wired? | Layers |
|---|---|---|
| Per-item `Items/{id}/Refresh` (metadata + image refresh) | wired | `refreshMetadata` task (`jellyfinProvider.ts:119-128`) |
| `POST /Library/Refresh` (full library rescan, all libraries) | not wired | task/actuator — **naming collision risk**: this is a library-wide action, structurally different from every existing task (`deleteItem`, `refreshMetadata`, etc.), which all take `ids: ActuatorTargetId[]`. A whole-library task has no target id — flag as needing a new `ActuatorTask` shape (zero-id / library-scoped), not just a new task entry. |
| `ScheduledTasks` API (list/trigger arbitrary server tasks, e.g. "Scan Media Library") | not wired | automation option — could plug into this app's existing automation model as a trigger, but note Jellyfin's own tasks are server-global (not per-library, mostly), a different granularity than this app's per-item automations. Flag, don't resolve. |

## Naming collisions flagged (for the precedence ticket — not resolved here)

1. **`Tags`** — Jellyfin `string[]` free-text vs. this repo's `EnrichmentFields.tags: number[]`
   (Radarr/Sonarr quality-tag ids, `instanceScoped`). Same name, incompatible type and meaning.
2. **`OfficialRating`** — Jellyfin's content-rating field vs. this repo's `certification` rule
   (Radarr/Sonarr/TMDB/OMDB-sourced). Same concept, different field name — merge-or-separate
   question for later.
3. **`CommunityRating`** vs. per-user `Rating`** — two Jellyfin fields already collide in concept
   with each other, and either could collide with a future generic "rating" filter.
4. **`Played`/`PlayCount`/`LastPlayedDate`** vs. existing `EnrichmentFields.playCount`/
   `lastWatchedAt` (Plex/Tautulli-sourced) — likely mergeable (same meaning), but now three
   providers would write the same field; precedence/merge order needs deciding.
5. **`DateCreated`** vs. `plexAddedAt` / generic `addedDate` (Radarr/Sonarr) — this repo already
   hit exactly this class of bug once (`filterRegistry.ts` comment documents the
   `plexAddedDaysAgo`/`addedDaysAgo` mismatch precedent); a `jellyfinAddedAt` needs the same
   "added by which system" disambiguation from day one.

## Structural schema-change gaps flagged (new column/table, not a settings-blob tweak)

1. **No `_sourceIds.jellyfin` join key** — `mediaIdentity.jellyfinItemId` exists as a column, but
   the runtime `_sourceIds` type (`movie.ts`, `series.ts`, `normalizeMedia.ts`) has no `jellyfin` key,
   so no `MediaFieldProvider` can key a Jellyfin-sourced field map by it today. This blocks *every*
   not-wired `BaseItemDto`/`UserItemDataDto` field above, not just one.
2. **Cast/crew (`People`)** — no relational shape exists for it anywhere in the schema; a one-item-
   to-many-people relationship, not a scalar column.
3. **Per-user watch state** — `mediaIdentity`/`media_item` has no per-user dimension; Jellyfin (and
   potentially Plex) supports multiple users per server instance with independent watched/favorite
   state, which this schema cannot represent without a new table.
4. **Live session state (Sessions API)** — ephemeral, not naturally a persisted column; if wired,
   likely wants a read-through endpoint rather than a database table.
5. **Media streams / quality data (`MediaSources`/`MediaStreams`)** — nested array shape, not a
   scalar column, parallel to but structurally distinct from Radarr/Sonarr's file-quality fields.

## Confirmed-fine (no gap)

- `deleteItem`, `refreshMetadata`, `markPlayed`, `markUnplayed`, `addToCollection` tasks are wired
  and functionally match Jellyfin's REST surface (`Items/{id}` DELETE, `Items/{id}/Refresh` POST,
  `UserPlayedItems/{id}` POST/DELETE, `Collections/{id}/Items` POST).
- Identity bridging via `ProviderIds` (Tmdb/Tvdb/Imdb) into `mediaIdentity.jellyfinItemId` is
  correctly scoped and matches Plex's `plexRatingKey` bridging pattern.
