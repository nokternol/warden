---
type: wayfinder-spec
label: wayfinder:spec
provider: _precedence
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/99-precedence.md
---

# Cross-provider precedence — E2E spec

Last spec in the map. Resolves every field-name collision flagged across the 10 provider specs'
"Naming-collision notes" sections, plus a fresh scan for anything missed. This is the source for
`server/modules/media/enrichment/precedence.ts`'s `contestedFieldPrecedence` and for any field
that instead stays deliberately unmerged.

## General precedence philosophy

Default: **arr-stack wins** (Radarr/Sonarr — the operational record of what's actually managed) >
TMDB/OMDB (canonical aggregator metadata) > Plex/Jellyfin (agent-scraped, most likely stale or
locally miscategorized) > Tautulli (proxies Plex, ranks last wherever it appears). Applied to every
field below unless a field-specific richness argument overrides it (certification, network).

## New setting: `primaryMediaServer`

Plex and Jellyfin are mutually-exclusive-by-default server choices, but a deployment can run both.
Every Plex-vs-Jellyfin position in this doc is **not** a fixed constant — it's driven by a new
`primaryMediaServer: 'PLEX' | 'JELLYFIN'` setting (default `PLEX`), joining the `region` setting
in the same system-wide settings table decided in `specs/tmdb.md`. Mechanically: the existing
static per-field order arrays in `contestedFieldPrecedence` stay as-is (still literal, still
readable); a small class wraps them, reads `primaryMediaServer`, and swaps the Plex/Jellyfin
positions in its output order before `resolvePrecedence` (unchanged — already takes precedence as
a parameter) consumes it.

## Resolved fields

| Field | Producers (precedence order, highest first) | Notes |
|---|---|---|
| `genres` (movies) | Radarr > TMDB > OMDB > Plex > Jellyfin | |
| `genres` (shows) | Sonarr > TMDB > TVMaze > Plex > Jellyfin | |
| `studio` | Radarr/Sonarr > TMDB > Plex > Jellyfin | OMDB has no studio field. |
| `certification` | TMDB > Radarr/Sonarr > OMDB > Plex > Jellyfin | **Overrides the general default.** TMDB is the only region-aware producer (via the `region` setting) — richness, not source type, decides this one. Value-format risk (exact case-insensitive string match across differently-formatted sources) is accepted as residual: TMDB winning whenever present means the risk rarely surfaces. No normalization pass added. |
| `runtimeMinutes` (unified across `contentTypes: ['movie','series']`) | Movies: Radarr > OMDB > Plex > Jellyfin. Shows: TVMaze > Plex > Jellyfin. | No TMDB producer, no Sonarr producer. Each content type resolves independently within one rule (a given item is only ever one content type, so the two producer sets never actually contest each other). |
| File-tech fields (`fileContainer`/`videoCodec`/`audioCodec`/`fileResolution`/`fileSizeBytes`/`fileBitrate`) | Plex/Jellyfin (primaryMediaServer-ordered) > Tautulli | Tautulli proxies Plex, always last. |
| `playCount` / `lastWatchedAt` | Tautulli > Plex/Jellyfin (primaryMediaServer-ordered) | Tautulli wins outright (tracks completed plays, not "opens") — already settled before this ticket; Jellyfin's rank (behind Tautulli, ordered against Plex by `primaryMediaServer`) is the new part. |
| `network` | Sonarr > TVMaze | Arr-stack default holds. `webChannel` (TVMaze-only, no Sonarr equivalent) stays a fully separate, uncontested field — no precedence entry. |
| `originCountry` | TMDB > OMDB | OMDB's single-valued `Country` one-element-array-wraps at the query-engine layer to match TMDB's array shape (query-engine concern, not a widget one — already flagged in `specs/tmdb.md`). |
| `releaseDate` | Plex/Jellyfin (primaryMediaServer-ordered) | Merges Plex's `originallyAvailableAt` and Jellyfin's `PremiereDate` as one contested field. Stays genuinely separate from Radarr's `inCinemas`/`physicalRelease`/`digitalRelease` (complementary distribution-milestone detail, not an overlapping duplicate of the same concept) and from `year` (already separate). |

## Naming disambiguation (not a precedence merge — distinct concepts, distinct names)

- **`seriesStatus`** — renamed from bare `status` (`NormalizedSeries.status`, series continuing/ended).
  The only unprefixed "status" field; now sits alongside `overseerrRequestStatus`,
  `overseerrIssueStatus`, `radarrStatus`, and `tmdbStatus` — none of which it merges with, each a
  distinct concept. TVMaze's status also maps onto this field's vocabulary (`Ended`→`ended`,
  `Running`→`continuing`, `To Be Determined`→`upcoming`) — same mapping already decided in
  `specs/tvmaze.md`, now documented at this field's new name.
- **`overseerrMediaStatus`** (reserved, not built) — the name to use if `MediaInfo.status`
  (Overseerr's media-availability enum, distinct from `overseerrRequestStatus`) is ever wired as a
  filter. No current field to rename; recorded so nobody picks a colliding name later.
- **`jellyfinLabels` vs `tagIds`** — permanently separate. String labels vs. numeric per-instance
  tag ids are not the same type and don't merge under one field or precedence entry.

## Confirmed as already correct (no change)

- `radarrStatus` — already disambiguated by its Radarr-prefix from the renamed `seriesStatus`.
- Radarr/Sonarr's `added` (addedAt-to-source) vs Plex's `plexAddedAt` / Jellyfin's `jellyfinAddedAt`
  (addedAt-to-library) — permanently distinct concepts, never merge, already separate filter rules.
- `tautulliRecentlyAdded` — observes the same Plex-library-add event as `plexAddedAt` through a
  second, staler API; joins that rule as an additional producer with Plex winning, not its own key.
- `tags` (Sonarr/Radarr) — identical shape, separate id spaces per instance, already correctly
  `instanceScoped: true`; `languageProfileId` follows the same treatment.

## Flagged, no action needed (forward-looking only, no current collision)

- `overseerrRequestedBy` vs a hypothetical future arr-stack "added by" field.
- `overseerrRequestId` vs `tmdbId` as canonical identity, if request-level identity is ever
  surfaced directly.
- `images` — TMDB's trending-backdrops feature vs. any future Plex/Jellyfin artwork concept; none
  of the three is a real filterable field today.
- `hasTrailer`/streaming-service flags vs. any future non-TMDB streaming-availability source.

## Destination reached

Every provider spec is now collision-safe. This closes the provider-e2e-spec map — the next step
is implementation (`/tdd` or `/plan-and-go`), out of scope for this map.
