---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Jellyfin — research

## Question

Audit Jellyfin's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/jellyfinProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/ruleRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Jellyfin's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: No prior gap analysis exists in docs/architecture/media-providers.md for Jellyfin specifically — treat as a fresh audit against the Jellyfin API, not just a diff against the Plex writeup, even though Jellyfin plays a similar MediaSource role.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/jellyfin.md](../research/jellyfin.md) — full field/task enumeration, wired vs.
  not-wired with file/line citations, naming-collision flags, and structural schema-change flags.

## Resolution

- Jellyfin is wired today only as a `MediaActuator` (5 tasks: delete/refresh/markPlayed/
  markUnplayed/addToCollection) and as an identity bridge (`ProviderIds` -> `mediaIdentity.jellyfinItemId`).
  It is not a `MediaSource`, has no `ProviderSet` slot, and has no `_sourceIds.jellyfin` key — so
  zero `BaseItemDto`/`UserItemDataDto` fields flow into filtering or enrichment despite
  `provider-registry.ts` advertising "Library contents" / "Item metadata" filter capabilities.
- `ruleRegistry.ts`, `mediaFieldProvider.ts`, and `enricherAdapters.ts` all have zero Jellyfin
  references — every metadata/user-data field (genres, studios, tags, ratings, overview, runtime,
  watch state, favorites, playback position) is a from-scratch wire-up.
- Five naming collisions flagged: `Tags` (type mismatch vs. Radarr/Sonarr's numeric tag ids),
  `OfficialRating` (vs. `certification`), `CommunityRating`/`Rating` (self-colliding, plus future
  rating fields), `Played`/`PlayCount`/`LastPlayedDate` (vs. existing Plex/Tautulli `playCount`/
  `lastWatchedAt` — likely mergeable), and `DateCreated` (vs. `plexAddedAt`/`addedDate`, repeating
  a naming-mismatch class this repo already got bitten by once).
- Five structural (non-settings-blob) schema gaps flagged: no `_sourceIds.jellyfin` join key
  (blocks everything downstream), no cast/crew relational shape, no per-user watch-state dimension
  (single hardcoded `userId` per instance today), no home for ephemeral session/now-playing state,
  and no shape for nested media-stream/quality data.
- Sessions API (now-playing, live playback control) and most of the Collections/Users/
  ScheduledTasks surfaces are entirely unaddressed; Collections is half-wired (`addToCollection`
  exists, `CreateCollection`/`RemoveFromCollection` don't); library-wide refresh (`/Library/Refresh`)
  needs a new zero-target-id actuator-task shape since every existing task assumes an id list.
