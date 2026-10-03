---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tmdb — research

## Question

Audit Tmdb's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/tmdbProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/filterRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Tmdb's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Partially wired: tmdbEnricher only calls getStatus(tmdbId) -> tmdbStatus. getMovieDetailsEnriched/getTvDetailsEnriched (certification, keywords, collection, spoken languages, origin country), getMovieWatchProviders/getTvWatchProviders, and getRatings are implemented but NOT consumed by EnrichmentJob — only by the separate ratingsAggregation.ts/providers.procedures.ts getRatings route and TmdbService's trending-backdrops feature. filterRegistry.ts already lists TMDB as a sourceProviders entry for genres/year/certification even though no enricher populates those fields from TMDB today — confirm whether to wire real enrichment or correct the stale registry entry.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/tmdb.md](../research/tmdb.md) — full field/task enumeration (wired-into-pipeline vs.
  implemented-but-unwired vs. not-implemented-at-all), naming-collision flags, and structural-schema
  flags.

## Resolution

- Confirmed the known state exactly: `tmdbEnricher` only calls `getStatus(tmdbId)` -> `tmdbStatus`
  (`EnrichmentFields`'s only TMDB key, `activeFieldSet.ts`'s only TMDB producer entry); everything else
  in `tmdbProvider.ts` (`getMovieDetailsEnriched`/`getTvDetailsEnriched`, watch-providers, `getRatings`)
  is implemented but consumed only by `ratingsAggregation.ts`/`providers.procedures.ts`'s `getRatings`
  route and `TmdbService`'s trending-backdrops feature — none of it reaches `EnrichmentJob`.
- `filterRegistry.ts`'s `year`/`certification`/`genres` rules hand-list `MetadataProviderType.TMDB` in
  `sourceProviders` directly, bypassing `activeFieldSet.ts`'s `fieldsByProviderType` (whose only TMDB
  entry is `tmdbStatus`) — two independent "does TMDB own this field" declarations that already
  disagree. Central open question for the decision ticket, presented but not resolved: wire real
  enrichment (`tmdbEnricher` starts calling the enriched-details methods, new `EnrichmentFields` keys,
  precedence work against Radarr/Sonarr's existing ownership of the same fields) vs. correct the
  registry entries as stale.
- Under the EAV persistence model (`docs/architecture/media-enrichment-eav-model.md`), essentially every
  gap found is a migration seed row, not a schema change — one exception flagged: TV-side
  `external_ids.tvdb_id` looks like an identity-crosswalk key, not a display fact, and could want to
  interact with `media_identity`'s id-matching columns instead.
- TMDB's API exposes a substantial not-yet-touched surface beyond what's already implemented-but-unwired:
  `external_ids`, `recommendations`, `similar`, `videos`, `images`, `credits`/`aggregate_credits`,
  `reviews`, `translations`, `alternative_titles`, full per-region `release_dates`/`content_ratings`
  (today collapsed to one string), and discovery endpoints (`trending`, `discover`, `popular`,
  `top_rated`) beyond the single `trending/movie/day` call `TmdbService` already makes.
- Naming-collision risks flagged (not resolved): a TMDB-sourced rating vs. the existing Radarr-owned
  `imdbRating`; `recommendations` vs. `similar` as genuinely distinct TMDB concepts; TMDB per-item
  `images` vs. `TmdbService`'s existing trending-backdrops vs. any future Plex-native artwork concept.
