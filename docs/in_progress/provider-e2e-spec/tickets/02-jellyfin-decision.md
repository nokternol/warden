---
type: wayfinder-ticket
label: wayfinder:grilling
status: closed
assignee: claude
blocked_by: [02-jellyfin-research]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Jellyfin — decision

## Question

Using the Jellyfin research ticket's gap-list, grill the user (`/grilling`, `/domain-modeling`
as needed) to decide Jellyfin's full e2e spec: which fields and tasks are worth wiring, what
domain field names they map to, how each field's value flows (db/config surface → provider field
→ query engine → enrichment → UI filter), what tasks/actions become automation options,
and what a user-facing description of each looks like. Write the result to
`docs/in_progress/provider-e2e-spec/specs/jellyfin.md`.

Any field/task the research ticket flagged as needing a structural schema change: raise it to the
user as a blocker in this session, do not decide its shape unilaterally. Any field-name collision
risk the research ticket flagged: note it in the spec file for the final precedence ticket to
resolve, don't resolve it here.

## Assets

- [specs/jellyfin.md](../specs/jellyfin.md) — full e2e spec. Decided jointly with `01-plex-decision`
  since the two providers share most of the same field/task shapes.

## Resolution

- **Jellyfin becomes a real `MediaEnricher` for the first time** — it was previously wired only as
  an actuator + identity bridge with zero enrichment fields. Prerequisite groundwork: adding
  `_sourceIds.jellyfin` (schema-shaped, not structural — same class as Sonarr's `_sourceIds.tvmaze`
  addition last session), without which nothing else in the spec can join back to a
  `NormalizedMovie`/`NormalizedSeries`.
- **Same shared-field strategy as Plex**: `genres`, `certification`, `studio`, `runtime`
  (ticks-converted), file-technical-metadata, and `playCount`/`lastWatchedAt` (Jellyfin as a third
  producer alongside Tautulli/Plex) all join existing multi-producer fields.
- **`jellyfinAddedAt` stays separate from `plexAddedAt`** — same *kind* of event (added-to-this-
  server's-library) from mutually-exclusive server choices, but unifying them would mean touching
  the already-shipped `plexAddedAt`/`plexAddedDaysAgo` migration, out of scope for this pass.
- **Ratings kept separate**: `jellyfinCommunityRating`/`jellyfinCriticRating`, same reasoning and
  same future-`MediaRatingsProvider` framing as Plex's ratings.
- **New capability**: `isFavorite`, scoped to the single configured Jellyfin user per instance (not
  full multi-user). `PlaybackPositionTicks` considered but dropped from this pass.
- **New task**: `removeFromCollection`, symmetric to the already-wired `addToCollection`.
  `createCollection` dropped — needs a task-parameter shape (create-flow vs. select-existing) the
  current model doesn't support.
- **Structural gaps raised and deferred, not designed**: sessions API, multi-user listing, people/
  cast-crew, library-wide refresh, ScheduledTasks API, per-episode fields.

## Addendum (from the TMDB/OMDB session)

`Overview`/`Name` moved from `EnrichmentFields` to on-demand item-detail metadata, same refined
principle and same session as Plex's `summary`/`tagline` amendment — see `specs/jellyfin.md`'s
amendment note.

## Addendum (full ratings pass, from the TVMaze session)

`jellyfinCommunityRating`/`jellyfinCriticRating` moved out of `specs/jellyfin.md`'s field table to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md), consolidated
with every other provider's ratings.
