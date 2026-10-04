---
type: wayfinder-spec
label: wayfinder:spec
provider: plex
status: implementing
source_ticket: docs/in_progress/provider-e2e-spec/tickets/01-plex-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/plex.md
---

# Plex — E2E spec

Plex is a `MediaEnricher` + `MediaActuator` and the identity anchor (`plexRatingKey`). This spec
applies two standing principles decided across this map's sessions:

1. **Per-item fields, per-item tasks only.** Session-scoped, library-scoped, server-scoped, and
   multi-user-scoped surfaces are all out of scope regardless of how interesting the data is.
2. **Redundancy across genuinely independent sources is valuable, not wasteful.** Plex is its own
   independently-configured metadata agent — its copies of genre/rating/studio/certification are a
   real fallback if Radarr/Sonarr/TMDB are missing or wrong, not a duplicate of the same underlying
   data (contrast with Tautulli's `get_metadata`, dropped last session because Tautulli merely
   re-reads Plex's own database — same source, zero redundancy value).

## Fields already wired (unchanged baseline)

| Domain field | Source | Notes |
|---|---|---|
| `playCount` | `viewCount` | Contested with Tautulli (wins) and now Jellyfin (see below). |
| `lastWatchedAt` | `lastViewedAt` | Same contest group as `playCount`. |
| `plexAddedAt` | `addedAt` | Library-added-to-Plex timestamp. Permanently distinct from Radarr/Sonarr's `added`/`addedDate` (addedAt-to-source) — never contests with it. |

Tasks already wired: `deleteFromLibrary`, `refreshMetadata`, `markPlayed`, `markUnplayed`.

**Doc drift note (not fixed here, outside this ticket's remit)**: `docs/architecture/media-providers.md`
lists a `moveToTrash` Plex task that doesn't exist in `plexProvider.ts` (4 tasks, not 5). Flagging per
adjacency to this audit; fixing that doc is a separate docs-lifecycle task.

## New fields to wire

### Shared fields (Plex becomes an additional producer, precedence order flagged for the final ticket)

| Domain field | Source | Shared with |
|---|---|---|
| `genres` | `Genre` tags | Radarr (movie), Sonarr + TMDB (show) |
| `certification` | `contentRating` | Radarr, Sonarr, TMDB, OMDB |
| `studio` | `studio` | Radarr |
| `runtime` | `duration` (ms → minutes) | Radarr. Movies only — no episode-runtime equivalent exists for shows yet. |
| `fileContainer` / `videoCodec` / `audioCodec` / `fileResolution` / `fileSizeBytes` | `Media`/`Part` sub-objects | Tautulli (`get_library_media_info`, wired last session). Plex is a more direct source than Tautulli (which itself just mirrors Plex) — likely higher precedence, decided by the final ticket not here. |
| `playCount` / `lastWatchedAt` | (already wired) | Now also Jellyfin — see `specs/jellyfin.md`. |

### New fields, not shared with anything today

| Domain field | Source | Notes |
|---|---|---|
| `releaseDate` | `originallyAvailableAt` | New shared concept with Jellyfin's `PremiereDate` — day-granularity release date, distinct from `year` (already wired) and from Radarr's milestone-specific dates (`inCinemas`/`physicalRelease`/`digitalRelease`). Relationship to those milestones flagged for the precedence ticket. |
| `plexLabels` | `Label` tags | Shared string-tag field with Jellyfin's `Tags` — both free-text, string-valued, kept separate from the numeric `tagIds` rule (Radarr/Sonarr, incompatible id-space/type). |
| `filePath` | `Media`/`Part.file` | Alongside the other file-tech fields above — useful for de-dup/diagnostics, not a filter target. |

### On-demand metadata (not enrichment — amended after the TMDB/OMDB session)

**`summary` and `tagline` moved here from the enrichment table above.** Refined principle
established while spec'ing TMDB/OMDB: data nobody would ever filter on is on-demand item-detail
metadata, not a batch-computed `EnrichmentFields` entry — captured as a JSDoc note on the provider
method for a future "full item detail" capability (fetched when a user views one specific item, not
pre-computed for every item), the same treatment as TMDB's `credits`/`reviews`/`translations` and
OMDB's `Plot`/`Director`/`Writer`/`Actors`. No functional difference in what gets stored, just where
the responsibility for fetching it lives — flagging as a precedent for future providers to follow
this refined split from the start rather than defaulting fields into `EnrichmentFields`.

**Flagged for verification, not decided here**: whether `guids` (the array already declared on
`PlexMediaItem`) is actually consumed downstream in identity/enrichment code, or just declared and
unused. Same class of flag as Radarr's `type` field mismatch — verify against a live read before
assuming it's wired.

**Ratings extracted to a dedicated intent doc**: `rating`/`audienceRating` moved to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) as
`plexRating`/`plexAudienceRating` — kept provider-prefixed there too (provenance is opaque, scale
incompatible across providers), not merged into `imdbRating` or any other rating field.

## Tasks / automation options

No new tasks. Every candidate Plex task beyond the four already wired is library-scoped, server-scoped,
or session-scoped:

- **Excluded (library/server-scoped)**: scan-all-libraries, scan-one-library, empty trash, optimize
  database — none take an item id.
- **Excluded (session-scoped)**: session playback control (pause/stop/seek) — addressed by session id,
  not `plexRatingKey`.

## Out of scope (structural, flagged not designed)

- **Collections** (`/library/collections`) — many-to-many item-to-collection membership, needs a join
  table, not a scalar field.
- **Playlists** — ordered many-to-many, cross-content-type, no existing analog.
- **Multi-user / Plex Home watch data** (`plex.tv/api/v2/home/users`) — `playCount`/`lastWatchedAt` are
  single scalars per item today; per-user watch state needs a per-(item, user) table. Also a known API
  limitation: PMS/plex.tv watch-status endpoints have historically conflated managed-user state with
  the owner's.
- **Sessions / now-playing** (`GET /status/sessions`) — live/ephemeral state, not a persisted per-item
  fact.
- **Webhooks** — a new inbound event-driven automation trigger *class* (vs. today's poll/schedule-based
  model), plus a Plex Pass licensing gate.
- **plex.tv Universal Watchlist** — a new entity not tied to a PMS item until matched; needs its own
  table.

## Naming-collision notes (for the final precedence ticket)

- **`genres`/`certification`/`studio`** — Plex joins existing multi-producer rules. Precedence order
  among Radarr/Sonarr/TMDB/Plex not decided here.
- **`runtime`** — Plex (ms) and Radarr (minutes, already wired) both feed this field; unit conversion
  happens at the provider-field layer, not the filter layer.
- **File-tech fields** — Plex, Jellyfin, and Tautulli are now three potential producers of the same
  fields. Plex/Jellyfin (direct sources) likely outrank Tautulli (proxies Plex) — not resolved here.
- **`playCount`/`lastWatchedAt`** — now three producers (Tautulli, Plex, Jellyfin). Existing precedence
  has Tautulli winning over Plex; Jellyfin's rank among the three is undecided.
- **`releaseDate`** vs `year` vs Radarr's release-date milestones — four adjacent-but-distinct date
  concepts now exist; precedence ticket should confirm `releaseDate`'s relationship to Radarr's
  milestones (complementary detail vs. overlapping duplicate).

## Implementation status

Every row below is implemented except `genres`/`certification`: the enrichment pipeline has no
mechanism today to keep Radarr/Sonarr's construction-time value from being overwritten by Plex's
enrichment-stored one, so wiring Plex as a producer for those two fields now would regress
existing behavior rather than extend it. Blocked on `_precedence.md`'s implementation landing
precedence-ordering machinery first. Tracked in `specs/_implementation-map.md`.

## Filter type mapping

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `genres` | `genres` | `csv-strings` | Joins existing `genres` rule (movie: Radarr; show: Sonarr/TMDB) — Plex becomes an additional producer, no new rule. |
| `certification` | `certification` | `csv-strings` | Joins existing `certification` rule (Radarr/Sonarr/TMDB/OMDB) — Plex becomes an additional producer, no new rule. |
| `playCount` | `watched` | `boolean` | Already-wired rule; Plex is already a producer, Jellyfin is the new one (see `specs/jellyfin.md`). No change here. |
| `lastWatchedAt` | `lastWatchedDaysAgo` | `range` | Already-wired rule; same as above — Jellyfin is the new producer, not Plex. |
| `studio` | `studio` | `csv-strings` | New rule. **Reconciled with Radarr's/Jellyfin's independently-made mapping** (both chose `csv-strings`, multi-select-by-string-value like `genres`/`network`) — converged here for consistency across the three specs. |
| `runtime` | `runtimeMinutes` | `range` | New rule. **Reconciled key name** — Radarr's/Jellyfin's/OMDB's independently-made mappings all used `runtimeMinutes`; converged here. Numeric (minutes, after ms→minute conversion at the field layer per spec) — same shape as `sizeOnDiskGb`/`imdbRating`. Movies only, per spec. **Flagged for the precedence ticket**: whether this should be the *same* rule as Radarr's movie-side `runtimeMinutes` (one rule spanning `contentTypes: ['movie','series']`, like `year`/`title`) rather than staying implicitly movie-scoped, now that TVMaze also mints a show-side `runtimeMinutes` — not resolved here. |
| `fileContainer` | `fileContainer` | `csv-strings` | New rule. **Reconciled dataType** — Tautulli's independently-made mapping used `csv-strings` (categorical small value set, e.g. "mkv"), matching the `certification`/`genres` convention; converged here over the initially-proposed `string`. Shared with Tautulli/Jellyfin per spec. |
| `videoCodec` | `videoCodec` | `csv-strings` | Same reconciliation as `fileContainer` — categorical (e.g. "h264"), converged to `csv-strings`. |
| `audioCodec` | `audioCodec` | `csv-strings` | Same reconciliation as `fileContainer` — categorical (e.g. "aac"), converged to `csv-strings`. |
| `fileResolution` | `fileResolution` | `csv-strings` | Same reconciliation as `fileContainer` — discrete tiers (2160p/1080p/720p/SD), converged to `csv-strings` matching Tautulli's own framing ("resolution below 1080p" implies discrete tiers, not a continuous number). |
| `fileSizeBytes` | `fileSizeBytes` | `range` | New rule. Numeric, parallel to `sizeOnDiskGb` but raw bytes (per-file, not aggregate disk usage — kept distinct, not merged into `sizeOnDiskGb`). |
| `releaseDate` | `releaseDaysAgo` | `range` | New rule. Date-shaped field modeled as days-ago per registry convention (see `addedDaysAgo`/`plexAddedDaysAgo`), not a raw date picker. |
| `plexLabels` | `labels` | `csv-strings` | New rule. Multi-select free-text tags, shared concept with Jellyfin's `Tags` — kept separate from the numeric `tagIds` rule (incompatible id-space/type) per spec. |
| `filePath` | — | — | No filter, display/on-demand only — spec explicitly flags this as "useful for de-dup/diagnostics, not a filter target." |
| `summary` / `tagline` | — | — | No filter — on-demand item-detail metadata per spec's amended principle, not batch-enriched. |
| `guids` | — | — | Not mapped — spec flags this as unverified (may be declared and unused), not a filter decision to make here. |
| `rating` / `audienceRating` | — | — | Not mapped — spec defers these to `docs/intent/media-ratings-provider.md`, out of this spec's filter scope. |

13 fields mapped: 2 join existing rules (`genres`, `certification`); 11 are new rules (`studio`,
`runtime`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`, `fileSizeBytes`,
`releaseDaysAgo`, `labels`, plus `playCount`/`lastWatchedAt` which stay on their already-wired rules
with Plex as an existing producer — no new mapping needed for those two). `filePath`,
`summary`/`tagline`, `guids`, and `rating`/`audienceRating` are explicitly not filter targets here.

### Tasks (automation options)

No new tasks in this spec (see "Tasks / automation options" above) — nothing to classify by
parameter shape. The four already-wired tasks, for reference: `deleteFromLibrary` (none),
`refreshMetadata` (none), `markPlayed` (none), `markUnplayed` (none).

## UI decisions

Resolves the crowding question this map raised for the whole provider set (~70 fields once every
provider's new rules land, not just Plex's 13): three prototyped layouts (accordion-by-provider,
sidebar panel, add-filter) were compared; add-filter was chosen as the only one that holds up at
that scale, since the other two still surface every configured rule's control unconditionally and
just relocate the crowding rather than resolving it.

**Widget choice**: an "Add filter" trigger (`ref:src/components/MediaFilterBar/FilterPicker.tsx`)
opens a grouped, searchable menu (native Popover API — light-dismiss, top-layer stacking, no
z-index/portal bookkeeping) listing every not-yet-visible rule, grouped by the same provider-section
labels `FilterGroup` already uses. Picking one renders that rule's real control inline on the bar.
A rule with an active value renders regardless of "added" state — existing/deep-linked filters never
silently disappear. Clearing a visible-but-inactive filter's value (via its own control) returns it
to the pool. Title and Year are unaffected — they stay outside this mechanic as permanent, always-on
controls (`ref:src/components/MediaFilterBar/index.tsx#L1174`).

**Verified**: `src/components/MediaFilterBar/MediaFilterBar.stories.tsx`'s `Interactive` story,
in-browser via Ladle — crowding reduced from all-rules-visible to Title + Year + one "Add filter (N)"
trigger; add flow, search-narrowing, and keyboard nav (arrow keys + Enter) all confirmed working. Not
yet verified inside the authenticated app shell (no dev-auth bypass available this session) or in
dark mode specifically, though the component uses only existing dark-mode-aware design tokens.

**Not yet decided**: the picker's exact placement/behavior at very high field counts per group (a
single provider exceeding what fits in the `max-h-96` scroll area) and whether search should also
match provider/group names, not just rule labels — neither is a blocker at Plex's 13-field scale.

### Per-field widget shapes (13 new/joining fields)

No field needs a bespoke control or a `/prototype` session — all 13 map onto the two generic
renderers `RuleControl` (`ref:src/components/MediaFilterBar/index.tsx`) already switches on by
`dataType`, so the design work is confirming that mapping plus each `csv-strings` field's options
source, not inventing new widget shapes:

- **`range` fields** (`runtimeMinutes`, `fileSizeBytes`, `releaseDaysAgo`) render via
  `NumberRangeFilter` — the same min/max pair already used by `sizeOnDiskGb`/`addedDaysAgo`. No
  `dataMin`/`dataMax` bounds decided here; leave unbounded like the existing numeric rules unless
  implementation finds a natural bound.
- **`csv-strings` fields** (`studio`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`,
  `labels`, plus `genres`/`certification` which join existing rules) render via
  `StringMultiSelectDropdown`, options resolved through `csvStringOptions(rule, scope, lookups)`.
- **`playCount`/`lastWatchedAt`** stay on their already-wired `boolean`/`range` controls — Plex adds
  no new control, only a new producer.

**Options-source decision for the 6 net-new `csv-strings` fields**: one dedicated route per field,
following the existing `listNetworks`/`listGenres` precedent exactly (`contract/media.ts`
+ `media.procedures.ts`) — an in-process `MediaCache<string[]>`, computed by dedupe+sort over
already-fetched library data (no dedicated DB distinct-query), added to the `Lookups` interface and
wired into `csvStringOptions`. Considered and rejected: one combined "facets" endpoint returning all
six lists — diverges from the established per-field pattern and couples six independent caches'
invalidation together for a marginal round-trip saving.

**Known gap to not repeat**: `certification` already has `dataType: 'csv-strings'` in
`ruleRegistry.ts` but no lookup source wired in the frontend, so its control silently renders empty
today (`ref:src/components/MediaFilterBar/index.tsx#L966`). Each of the 6 new routes above must ship
together with its `csvStringOptions` branch and `Lookups` field in the same change — not as a
follow-up — so none of them repeat that gap.
