# Tautulli — API surface audit

Research asset for `docs/in_progress/provider-e2e-spec/tickets/05-tautulli-research.md`. Exhaustive
enumeration of Tautulli's API surface (source: https://docs.tautulli.com/extending-tautulli/api-reference,
cross-checked against https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference) against what
this codebase currently wires. **Enumeration only — no curation, no build decisions.**

## Codebase entry points read

- `server/modules/providers/connections/tautulliProvider.ts` — the provider class, implements
  `MediaActuator`.
- `server/modules/providers/connections/baseProviderConnection.ts` — shared `ky` client, reads
  `provider.settings.urlBase` from the JSON settings blob.
- `server/modules/media/mediaFieldProvider.ts:91-111` — `tautulliFieldProvider`.
- `server/modules/media/enrichment/enricherAdapters.ts:85-97` — `tautulliEnricher`.
- `server/modules/media/enrichment/precedence.ts:26-29` — `contestedFieldPrecedence`.
- `server/modules/media/ruleRegistry.ts:149-161,470-482` — `watched`, `lastWatchedDaysAgo` rules.
- `server/modules/providers/providerFactory.ts` — construction + `ProviderSet.tautulli` slot.
- `server/modules/providers/roles.ts` — `MediaActuator`/`ActuatorTask` shape, `ActuatorTargetId`.
- `server/modules/media/actuatorIdResolver.ts:14` — Tautulli addressed via `plexRatingKey`, no id
  space of its own.
- `server/modules/automations/automationService.ts:73-86` — `CONTENT_TYPE_PROVIDERS` includes
  Tautulli for both movie/show content types (source of watch-stats filters, not a catalog source).
- `src/lib/provider-registry.ts:48-56` — `PROVIDER_REGISTRY.TAUTULLI` entry (`filterCapabilities`:
  `['Watch history', 'Play statistics', 'User activity']` — note this already advertises more than
  is wired; see gaps below).
- `server/database/schema.ts:13-16` — `MetadataProviderType.TAUTULLI` enum member; no Tautulli-specific
  columns exist, only `MetadataProvider.settings` (JSON blob).

## Wired today

| Tautulli endpoint | Codebase surface | Wired at |
|---|---|---|
| `get_history` | `TautulliProvider.getHistory()`, `.searchHistory()` | `tautulliProvider.ts:74-85` |
| `get_history` (again, per rating key) | `TautulliProvider.deleteWatchHistory()` (looks up row ids to delete) | `tautulliProvider.ts:94-107` |
| `delete_history` | `TautulliProvider.deleteWatchHistory()` → actuator task `deleteWatchHistory` | `tautulliProvider.ts:42-51,106` |
| `get_libraries_table` | `TautulliProvider.getLibraryStats()` | `tautulliProvider.ts:65-68` — **called nowhere else in the audited files; return type `TautulliLibraryStat` unused downstream.** |
| `get_home_stats` | `TautulliProvider.getHomeStats()` | `tautulliProvider.ts:70-72` — **also called nowhere else; `TautulliHomeStat`/`TautulliHomeStatRow` unused downstream.** |

Derived fields (from `get_history` via `tautulliFieldProvider`):

| Domain field | Derivation | Wired at |
|---|---|---|
| `playCount` | count of history rows per `rating_key` | `mediaFieldProvider.ts:96-110` (`visit`), consumed by `tautulliEnricher` |
| `lastWatchedAt` | max `played_at` per `rating_key`, converted unix→ISO | same |

Filter rules consuming those fields:

| Filter key | Source field | Wired at |
|---|---|---|
| `watched` | `playCount > 0` | `ruleRegistry.ts:149-161` |
| `lastWatchedDaysAgo` | `lastWatchedAt` | `ruleRegistry.ts:470-482` |

Task (actuator):

| Task id | Underlying calls | Wired at |
|---|---|---|
| `deleteWatchHistory` | `get_history` (lookup) → `delete_history` | `tautulliProvider.ts:42-51` |

**Correction to ticket's stated assumption:** the ticket says "Tautulli is primarily a stats/history
service, so tasks may not exist yet." This is **not accurate** — `TautulliProvider` already
implements `MediaActuator` with one task, `deleteWatchHistory`, which is destructive
(`destructive: true`) and `affects: 'media'`. It is presumably already exposed through the
Automations UI via `CONTENT_TYPE_PROVIDERS`/actuator discovery machinery, though this audit did not
trace the UI-side actuator listing.

## Not wired — candidate fields/tasks by API endpoint

Grouped by Tautulli endpoint, each row tagged with the spec layer(s) it would touch if built.

### Per-user stats

| Endpoint | Fields | Layers touched if built |
|---|---|---|
| `get_users` | user id, username, email, admin flag, restrictions, shared libraries, avatar | provider field (new "user" dimension — see structural gap below), UI filter (e.g. "watched by user X"), query engine |
| `get_user` | per-user activity/permissions/watch-history flag/contact/auth tokens | same as above |
| `get_users_table` | paginated user list w/ friendly_name, last_seen, plays, duration | provider field, UI filter, query engine |
| `get_user_watch_time_stats` | play count + total watch duration per period (1/7/30/all days), per user | provider field (per-user, per-item aggregation — doesn't fit today's per-item `playCount`/`lastWatchedAt` shape), UI filter, query engine, **enrichment** (new `MediaFieldProvider` needed) |
| `get_user_player_stats` | platform/player/device usage counts per user | provider field, UI filter (device/client filter), enrichment |
| `get_user_ips` | IP address history, platform, player, first/last seen, play count | provider field, UI filter (low priority — access/security data, not media-descriptive), enrichment, possibly db/config (IP retention/audit is not item-scoped) |
| `get_user_logins` | login timestamps, IP, browser, OS, session expiry | same as above — auth/audit data, not media metadata |
| `delete_all_user_history` | destructive, per-user | task/actuator (new task alongside `deleteWatchHistory`), automation |
| `undelete_user` | restore | task/actuator |

### Transcode / stream quality stats

| Endpoint | Fields | Layers touched if built |
|---|---|---|
| `get_stream_data` | bitrate, codecs (video/audio), resolution, subtitle info, transcode decision (direct play/direct stream/transcode), device/player | provider field (per-play, not per-item — needs aggregation policy), UI filter (e.g. "ever transcoded", "max stream resolution"), query engine, enrichment |
| `get_activity` | live currently-playing sessions: bandwidth, per-session codec/bitrate/resolution/user | **not item-scoped at all** — this is live server state, not a media field. Would be its own feature surface (a "Now Playing" view), not a `ruleRegistry` field. Flag as out-of-shape for the enrichment pipeline entirely. |
| `terminate_session` | stop an active stream | task/actuator (session-scoped, not media-id-scoped — doesn't fit `ActuatorTargetId`/`plexRatingKey` addressing used today; **structural mismatch**, not just unwired) |
| `get_plays_by_stream_type` | Direct Play / Direct Stream / Transcode counts over time | aggregate/reporting data, not a per-item field — would need a new "stats dashboard" surface, not `ruleRegistry` |
| `get_plays_by_source_resolution` / `get_plays_by_stream_resolution` | resolution-bucketed play counts over time | same — aggregate reporting, not item-level |

### Library stats

| Endpoint | Fields | Layers touched if built |
|---|---|---|
| `get_libraries` | section id/name/type, item counts, activity status, artwork | provider field (library-level, not item-level — doesn't map onto per-item `EnrichmentFields`) |
| `get_library` | item/parent/child counts, notification settings, history retention | db/config surface (retention settings look like provider config, not media data) |
| `get_library_media_info` | container, bitrate, codecs, resolution, file size, per-item play history | provider field (**this one is genuinely item-scoped** — file-level technical metadata + play history per item), UI filter (codec/resolution/file-size filters), query engine, enrichment |
| `get_library_user_stats` | per-user plays per library | provider field, UI filter, enrichment |
| `get_library_watch_time_stats` | plays/duration per library per period | aggregate reporting |
| `delete_all_library_history` / `delete_library` / `undelete_library` | destructive, per-library | task/actuator |

### Metadata / search

| Endpoint | Fields | Layers touched if built |
|---|---|---|
| `get_metadata` | title, summary, ratings, media info, cast, genres | **overlaps existing metadata already sourced from Plex/Radarr/Sonarr/TMDB** — likely redundant unless Tautulli's copy diverges (e.g. cached at a different freshness); flag as low-priority duplicate, not a gap |
| `get_recently_added` | recently-added items w/ full metadata | naming-collision risk (see below) — Radarr/Sonarr/Plex all have their own "added" semantics already noted in the map's own example collision |
| `get_children_metadata`, `search`, `get_new_rating_keys`, `get_old_rating_keys` | id-resolution / hierarchy helpers | infrastructure, not domain fields — would support id-mapping robustness, not new filters |

### Notifications

| Endpoint | Fields/Action | Layers touched if built |
|---|---|---|
| `get_notifiers`, `get_notifier_config` | configured notification agents, their config | db/config surface (would need its own settings shape — likely structural since notifier configs are nested/agent-specific, not flat) |
| `notify`, `notify_recently_added`, `notify_newsletter` | send notification via a configured notifier | task/actuator (outbound-notification task — a genuinely new task shape, not media-id-addressed like `deleteWatchHistory`) |
| `add_notifier_config`, `set_notifier_config`, `delete_notifier` | manage notifier config | db/config surface, task/actuator (admin actions, not media actions) |

### Server / config / geolocation / logs

| Endpoint | Fields | Layers touched if built |
|---|---|---|
| `get_server_info`, `get_server_identity`, `get_server_friendly_name`, `get_pms_update` | PMS version/identity/update info | db/config surface only (diagnostic, not a media field) |
| `get_settings`, `download_config`, `download_database`, `download_log`, `export_metadata` | config/data export | out of scope for media filtering — admin/ops tooling |
| `get_geoip_lookup`, `get_whois_lookup` | IP geolocation/ownership | supports `get_user_ips` enrichment only if that's ever built; standalone otherwise |
| `get_logs`, `get_plex_log`, `status`, `update_check`, `delete_cache*`, `backup_*`, `docs*` | operational/introspection | out of scope entirely |

## Naming-collision risks (flagged, not resolved)

1. **`playCount` / `lastWatchedAt`** — already contested and already resolved in
   `precedence.ts:26-29` (Tautulli wins over Plex). Confirmed genuinely distinct sources: Plex's
   `playCount` comes from `viewCount` (`mediaFieldProvider.ts:163`, an "opens" counter that
   increments even on a scrub/replay open), Tautulli's comes from counting `get_history` rows
   (`mediaFieldProvider.ts:96-110`, i.e. completed-play events subject to Tautulli's own
   watched-threshold). Same field name, same rough concept ("has this been watched"), but not the
   same measurement — this collision is already known-and-handled, listed here only for
   completeness per the ticket's requirement to flag every same-name-field, not just new ones.
2. **`get_recently_added` → "added" semantics** — the map's own header example flags Plex's `added`
   (downloaded-to-library) vs Radarr's `added` (added-to-source) as a live unresolved collision.
   Tautulli's `get_recently_added` would introduce a *third* "added" concept (recently-added-to-
   Tautulli's-index, effectively mirroring Plex's library-add event but through a different API with
   its own latency/caching characteristics). Flag for the precedence ticket if this endpoint is ever
   wired — do not assume it is identical to Plex's `plexAddedAt`.
3. **Per-user `watched`/play-count data** — if `get_user_watch_time_stats` or `get_library_user_stats`
   is ever wired, it produces a *per-(user, item)* play count, not the *per-item* `playCount` the
   domain model has today. Same underlying word ("plays") but a different cardinality/shape — flag
   as a naming and shape collision, not just naming.
4. **`get_stream_data`/`get_activity` "resolution"** — could collide in name with any future
   Radarr/Sonarr "quality profile" or file-resolution field; Tautulli's is *played* resolution
   (post-transcode-decision), while Radarr/Sonarr's would be *source-file* resolution. Distinct
   concepts if both ever exist.

## Structural schema-change gaps (flagged, not designed)

1. **Per-user data has no home.** Every `EnrichmentFields`/`MediaItem` today is item-scoped
   (`mediaFieldProvider.ts:16-24`), keyed by a single cross-provider identity. `get_users`,
   `get_user_watch_time_stats`, `get_user_player_stats`, `get_user_ips`, `get_user_logins` are all
   *user*-scoped or *(user, item)*-scoped. Fitting these onto the existing item-shaped
   `EnrichmentFields` would either lose the per-user dimension (defeating the point) or requires a
   structural change — a new table/relation for per-user-per-item facts, not a config value in the
   `settings` JSON blob.
2. **Session/live-activity data doesn't fit the enrichment model at all.** `get_activity`,
   `terminate_session` describe transient server state (who's watching right now), not persisted
   per-item facts. No amount of new `EnrichmentFields` entries models this — it would need its own
   feature surface (e.g. a live "Now Playing" view backed by polling, not enrichment/ruleRegistry).
3. **Notifier config is nested/agent-specific, not flat.** `get_notifier_config`/`set_notifier_config`
   carry an agent-dependent schema (different fields per notifier type: email, Discord, webhook,
   etc.). This doesn't fit cleanly into the flat `settings` JSON blob pattern used for provider
   connection config today — likely needs its own table if ever built, flagged not designed.
4. **Library-level (not item-level) stats have no home.** `get_libraries`, `get_library`,
   `get_library_watch_time_stats` are section-scoped, one level above the per-item `MediaItem`. No
   existing surface aggregates at that granularity.
5. **`terminate_session`'s addressing space is a session, not a media id.** `ActuatorTargetId` today
   is `number | string` resolved through `actuatorIdResolver.ts` into `plexRatingKey` for Tautulli.
   A stream-termination task would need to address a *session*, which has no relationship to a
   `plexRatingKey` — this is a task-shape mismatch, not just a missing task.

## Endpoints intentionally not detailed further

Operational/diagnostic endpoints (`get_logs`, `get_plex_log`, `status`, `update_check`,
`delete_cache`, `delete_image_cache`, `backup_config`, `backup_db`, `docs`, `docs_md`,
`get_server_id`, `get_server_list`, `get_server_pref`, `server_status`, `get_date_formats`,
`download_log`, `download_plex_log`) are enumerated in the source table above but not further
broken out per-field — none of them describe media, users, or playback in a way that would touch
`ruleRegistry`, enrichment, or actuator tasks. Listed for completeness only.
