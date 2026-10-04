---
type: wayfinder-ticket
label: wayfinder:grilling
status: closed
assignee: claude
blocked_by: [08-omdb-research]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Omdb — decision

## Question

Using the Omdb research ticket's gap-list, grill the user (`/grilling`, `/domain-modeling`
as needed) to decide Omdb's full e2e spec: which fields and tasks are worth wiring, what
domain field names they map to, how each field's value flows (db/config surface → provider field
→ query engine → enrichment → UI filter), what tasks/actions become automation options,
and what a user-facing description of each looks like. Write the result to
`docs/in_progress/provider-e2e-spec/specs/omdb.md`.

Any field/task the research ticket flagged as needing a structural schema change: raise it to the
user as a blocker in this session, do not decide its shape unilaterally. Any field-name collision
risk the research ticket flagged: note it in the spec file for the final precedence ticket to
resolve, don't resolve it here.

## Assets

- [specs/omdb.md](../specs/omdb.md) — full e2e spec. Decided jointly with `07-tmdb-decision`, since
  OMDB's central open question (title-search reliability) resolves using an id already surfaced by
  Radarr, and several fields (certification, genres, runtime, country, ratings) now join the same
  shared fields TMDB also joins.
- Correction carried from research, not re-litigated: `imdbRating`'s `ruleRegistry.ts` entry does
  **not** list OMDB today (Radarr-only) — only `certification` had the stale listed-but-unpopulated
  gap.

## Resolution

- **Central open question resolved**: OMDB switches from title-based (`t=`) to ID-based (`i=`)
  lookup using the already-populated `_sourceIds.imdb`, falling back to title search only when no
  IMDb id is known — eliminates the mismatch risk `ratingsAggregation.ts` already defends against,
  with zero new schema.
- **`certification`/`genres`/`runtime`/`originCountry` all join the existing shared fields** as
  additional OMDB-sourced producers, several previously unparsed (`Rated`, `Genre`, `Runtime`,
  `Country`) now wired for the first time.
- **`awardWinner`/`oscarWinner` booleans wired into the pipeline** — already derived, just never fed
  to `EnrichmentJob` before.
- **Director/Writer/Actors/Plot/BoxOffice/raw Awards text moved to on-demand item-detail metadata**
  (JSDoc-noted), per the refined "never filtered on → not enrichment" principle established this
  session — same treatment as TMDB's `credits`/`reviews`/etc.
- **Season/episode lookup mode and search mode (`s=`) excluded** — consistent with per-episode
  granularity being out of scope everywhere else in this map.

## Addendum (full ratings pass, from the TVMaze session)

`imdbRating`/`imdbVotes`, `rottenTomatoesRating`/`rottenTomatoesVotes`, `metacriticRating`/
`metacriticVotes` moved out of `specs/omdb.md`'s field table to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) — the "joined
as shared fields for now, revisit if a ratings role solidifies" caveat from this ticket's original
Resolution is now resolved: that role is being scoped, so the fields moved there instead of waiting.
`awardWinner`/`oscarWinner` stay in `specs/omdb.md` unaffected — award-signal booleans, not numeric
ratings, explicitly out of the ratings-role extraction.
