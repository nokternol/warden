---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Radarr — research

## Question

Audit Radarr's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/radarrProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/filterRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Radarr's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Wired: MediaSource (movie) + MediaActuator, source fields (genres, etc.) flow direct to filterRegistry. Known gap: modelledRun documented as 'reject on invocation, not yet implemented' against Radarr's API — confirm current status. Naming-collision risk: Radarr's 'added' is addedAt-to-source, distinct from Plex's 'added' (downloadedAt-to-library).

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/radarr.md](../research/radarr.md) — full field/task enumeration, wired-vs-not-wired,
  naming-collision flags, structural-schema flags.

## Resolution

- Movie resource: most flat fields are wired (title, year, hasFile, tmdbId, imdbId, qualityProfileId,
  tags, genres, added→addedDate, certification, imdb rating, sizeOnDisk). Not wired: `monitored` (typed
  and normalized but no movie-side filter rule — the `monitored` rule is show-only), `path`/`folderName`,
  `images`, sub-ratings (tmdb/metacritic/rottenTomatoes/trakt values+votes), `statistics.movieFileCount`/
  `releaseGroups`, plus a whole tier of fields this codebase's `RadarrMovie` type doesn't even declare
  (studio, collection, minimumAvailability, status, runtime, release-date milestones, overview, etc).
- Queue and history endpoints (`/queue`, `/history`) are entirely unwired — and unlike scalar fields,
  both are 1:N collections per movie, which doesn't fit the `media_enrichment` EAV shape; flagged as a
  possible structural-schema gap for the decision ticket, not resolved here.
- `modelledRun` status has moved on since `docs/architecture/media-providers.md` was written: only
  `deleteMovieKeepFiles` still rejects on invocation. `changeQualityProfile`, `addTag`, `removeTag` are
  now real implementations against Radarr's `movie/editor` endpoint — that doc's lines 33-34 are stale
  and need a follow-up correction (out of this ticket's scope).
- Candidate not-yet-exposed tasks confirmed against Radarr's real command classes: `RefreshMovie`,
  `RescanMovie`, `RenameMovies`, `MoveMovieCommand`/`BulkMoveMovieCommand` (root-folder move — named in
  the ticket's starting context), `RefreshCollectionsCommand`, plus `MissingMoviesSearch` and
  `DownloadedMoviesScan` (different selection semantics from existing per-item tasks).
- Naming-collision confirmed and detailed: Radarr's `added` (addedAt-to-source, source-system
  bookkeeping timestamp) vs Plex's `plexAddedAt` (addedAt-to-library) are already correctly kept as two
  separate filter rules (`addedDaysAgo` vs `plexAddedDaysAgo`) — but `addedDaysAgo`'s `sourceProviders`
  hand-lists Plex alongside Radarr/Sonarr with no code path showing Plex ever populating that field,
  which looks like a stale/incorrect listing worth the decision ticket's attention. A second latent
  collision flagged: Radarr's (unwired) `status` field (movie release-lifecycle enum) vs the existing
  `NormalizedSeries.status` (series continuing/ended) — different meanings, same field name, only a risk
  if movie `status` is ever wired.
