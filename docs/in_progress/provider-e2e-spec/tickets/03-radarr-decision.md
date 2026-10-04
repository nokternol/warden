---
type: wayfinder-ticket
label: wayfinder:grilling
status: closed
assignee: claude
blocked_by: [03-radarr-research]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Radarr — decision

## Question

Using the Radarr research ticket's gap-list, grill the user (`/grilling`, `/domain-modeling`
as needed) to decide Radarr's full e2e spec: which fields and tasks are worth wiring, what
domain field names they map to, how each field's value flows (db/config surface → provider field
→ query engine → enrichment → UI filter), what tasks/actions become automation options,
and what a user-facing description of each looks like. Write the result to
`docs/in_progress/provider-e2e-spec/specs/radarr.md`.

Any field/task the research ticket flagged as needing a structural schema change: raise it to the
user as a blocker in this session, do not decide its shape unilaterally. Any field-name collision
risk the research ticket flagged: note it in the spec file for the final precedence ticket to
resolve, don't resolve it here.

## Assets

- [specs/radarr.md](../specs/radarr.md) — full e2e spec.

## Resolution

- **Two bug fixes in scope**: the `monitored` filter rule extended to movies (was show-only despite
  the data already being populated), and the stale `PLEX` entry removed from `addedDaysAgo`'s
  `providers` (nothing populates it from Plex). Confirmed with the user: Radarr's `added`
  (addedAt-to-source) and Plex's `plexAddedAt` (addedAt-to-library/import) are permanently distinct
  concepts, never to be merged under one precedence rule.
- **Broad field wiring accepted**: all already-typed-but-unread rating/statistics/path fields, plus
  overview, release-date milestones, title variants, studio, runtime, isAvailable, `radarrStatus`
  (prefixed to avoid the `NormalizedSeries.status` collision), and config-surface fields
  (minimumAvailability/rootFolderPath/website/trailer).
- **`collection` flattens to a scalar pair** (`collectionName`/`collectionTmdbId`) rather than
  relational modeling — fits the existing `media_enrichment` EAV shape with no schema change.
- **Tasks completed/added**: `deleteMovieKeepFiles` (real DELETE), `moveMovie`, `refreshMovie`,
  `rescanMovie`, `renameMovies`, `refreshCollection`. Instance-scoped commands
  (`MissingMoviesSearch`, `DownloadedMoviesScan`) stay out of scope — don't fit the per-item task
  shape.
- **Queue/history endpoints raised as structural blockers**, deferred: 1:N per movie, doesn't fit the
  `media_enrichment` EAV shape, would need its own table.
- **Naming collisions flagged for the precedence ticket**: `radarrStatus` vs
  `NormalizedSeries.status`, `certification` value-format risk across four providers. The
  `added`/`plexAddedAt` split is treated as settled, not open, per the user's explicit direction.

## Addendum (full ratings pass)

`imdbVotes`, `tmdbRating`/`tmdbRatingVotes`, `metacriticRating`/`metacriticVotes`,
`rottenTomatoesRating`/`rottenTomatoesVotes`, `traktRating`/`traktVotes` moved out of
`specs/radarr.md`'s field table to [`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md)
— see that doc for why ratings don't fit this ticket's shared-EnrichmentFields pattern. The
already-live `imdbRating` field is unaffected.
