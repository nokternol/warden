---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Omdb — research

## Question

Audit Omdb's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/omdbProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/ruleRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Omdb's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Inert toward the pipeline: OmdbProvider implements neither MediaSource, MediaEnricher, nor MediaActuator. Only used by ratingsAggregation.ts/providers.procedures.ts's getRatings route. ruleRegistry.ts lists OMDB as a providers entry for certification/imdbRating even though nothing populates those fields from OMDB today — same 'listed but not wired' gap as TMDB's.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/omdb.md](../research/omdb.md) — full field-by-field enumeration (API surface vs.
  parsed vs. wired), gap-by-layer breakdown, collision flags, and structural-schema-change flags.

## Resolution

- Confirmed known state: `OmdbProvider` implements none of `MediaSource`/`MediaEnricher`/
  `MediaActuator`; only consumed by `ratingsAggregation.ts` and `providers.procedures.ts`'s ad hoc
  `getRatings` route — zero fields reach the media-item pipeline today.
- Correction to the ticket's framing: `ruleRegistry.ts`'s `imdbRating` rule does **not** list
  OMDB as a `providers` entry (it's Radarr-only) — only `certification` has the "listed but
  not populated" gap for OMDB. `certification` is a double gap: OMDB's `Rated` field isn't even
  parsed by `OmdbProvider` today, let alone wired.
- OMDb's official docs confirm ID-based lookup (`i=<imdbID>`) is fully supported as an alternative
  to the title-search (`t=`) the codebase uses exclusively today. `_sourceIds.imdb` is already
  populated (from Radarr) for movies, so ID-based OMDB lookup is available with zero new schema —
  this is the natural mitigation for OMDB's title-match reliability risk.
- Central open question flagged for the decision ticket: does OMDB warrant a real `MediaEnricher`
  role given its title-search fragility (a risk distinct from ID-keyed providers), especially since
  `ratingsAggregation.ts` already contains a defensive imdbId-mismatch check between TMDB and OMDB
  that signals existing distrust of OMDB's title-match correctness?
- Collision risks flagged (not resolved): `imdbRating` (OMDB's own field vs. Radarr-sourced
  `NormalizedMovie.imdbRating` vs. TMDB's rating field — three sources, one name), `Rated` vs.
  `certification` (same concept, different field name), and OMDB's internal `Ratings[]` Metacritic
  entry vs. its separate `Metascore` field (same number, two representations).
