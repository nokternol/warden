---
type: wayfinder-ticket
label: wayfinder:grilling
status: closed
assignee: claude
blocked_by: [07-tmdb-research]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tmdb — decision

## Question

Using the Tmdb research ticket's gap-list, grill the user (`/grilling`, `/domain-modeling`
as needed) to decide Tmdb's full e2e spec: which fields and tasks are worth wiring, what
domain field names they map to, how each field's value flows (db/config surface → provider field
→ query engine → enrichment → UI filter), what tasks/actions become automation options,
and what a user-facing description of each looks like. Write the result to
`docs/in_progress/provider-e2e-spec/specs/tmdb.md`.

Any field/task the research ticket flagged as needing a structural schema change: raise it to the
user as a blocker in this session, do not decide its shape unilaterally. Any field-name collision
risk the research ticket flagged: note it in the spec file for the final precedence ticket to
resolve, don't resolve it here.

## Assets

- [specs/tmdb.md](../specs/tmdb.md) — full e2e spec. Decided jointly with `08-omdb-decision`.

## Resolution

- **Stale ruleRegistry listing resolved by wiring for real**, not by correcting the listing —
  `genres`/`certification`/`year` all become genuinely TMDB-produced, joining the existing
  multi-producer fields.
- **Same-source dedup, not new redundancy**: TMDB's own direct API call for rating/collection data
  outranks the *same* TMDB data already reached indirectly through Radarr's bundled pull — this is
  one source reached two paths, not two independent sources, distinguishing it from the genuine
  redundancy case (Plex/Jellyfin/TMDB's independently-configured metadata).
- **New system-wide `region` setting decided as a structural blocker**: no settings mechanism above
  per-provider exists today; a new table is needed. Drives both streaming-service flags and
  region-selected certification (replacing the hardcoded US-preferred fallback) — certification stays
  single-valued per item, just region-configurable instead of hardcoded.
- **`external_ids` wired as an identity crosswalk**, not enrichment — same treatment as Sonarr's
  `imdbId`/`tvMazeId`.
- **Refined principle established this session, applied retroactively**: data nobody would filter on
  is on-demand item-detail metadata (JSDoc-noted for a future capability), not `EnrichmentFields`.
  Applied to TMDB's `credits`/`reviews`/`translations`/`recommendations`/`similar`/`images`, and
  retroactively to `01-plex-decision`/`02-jellyfin-decision`'s `summary`/`tagline`/`Overview` (see
  those tickets' addenda).
- **Discovery/trending endpoints excluded** — not per-item, flagged as a possible future
  "suggest acquisitions" automation, not designed.

## Addendum (full ratings pass, from the TVMaze session)

`tmdbRating`/`tmdbRatingVotes` moved out of `specs/tmdb.md`'s "same-source dedup" section to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) — the
same-source-dedup reasoning (TMDB direct call outranks Radarr's bundled copy) carries over
unchanged, just relocated alongside every other provider's ratings. `collectionName`/
`collectionTmdbId` (not a rating) stays in `specs/tmdb.md`, unaffected. TMDB's rating read site
(`getRatings()`) now requires a JSDoc note pointing at the intent doc, per that doc's durability
requirement.
