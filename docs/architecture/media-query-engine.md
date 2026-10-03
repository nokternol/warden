# MediaQueryEngine — the single owner of "what does this query match"

[`server/modules/media/mediaQueryEngine.ts`](ref:path:server/modules/media/mediaQueryEngine.ts) is the single owner of query
evaluation.

## The three concepts

The set of media a query defines is not a stored entity — it is the *result* of evaluating a query
specification against live source data.

- **`MediaQuery`** — the specification: a **bound provider instance**, a `contentType`
  (`'movie' | 'series'`), and one-or-more **sources**, each `{ filterValues, role: 'include' | 'exclude' }`.
  A query is a single-source include `MediaQuery`; the browse view is the same with URL-derived
  `filterValues`.
- **`MediaQueryEngine.evaluate(query): Promise<MediaItemSet>`** — the owner. Fetches the bound provider's
  items, normalizes them, merges DB enrichment, applies the predicate registry per source (`matchItems`),
  and combines include/exclude across sources (`evaluateCombination`).
- **`MediaItemSet`** — the transient result: the matched normalized items (`NormalizedMovie |
  NormalizedSeries`). Callers project ids to act, or paginate/sort to display. No table.

## Why a bound provider *instance*, not provider settings

`MediaQuery.provider` is an already-constructed provider, not `MetadataProvider` settings + a factory.
This keeps provider construction to **exactly one `ProviderFactory.create` per execution**: the executor
builds the provider once, hands the instance to `evaluate`, and reuses the *same* instance for
`task.run`. The engine never news a provider — each caller owns that decision:

| Caller | Builds the provider via | Uses the result for |
|---|---|---|
| `AutomationExecutor.executeWithSources` | `providerFactory.create(providerSettings)` | project ids → `task.run` |
| `GET /media-queries/:id/preview` | one active instance per `MediaSourceFactory.sourcesFor(contentType)` entry — no longer single-active for `movie`/`series` | `{ count, instances: [{ providerId, name, count }] }`, summed across instances |
| `media.handler` browse (`listMovies`/`listSeries`) | a thin adapter over the cached per-instance sublists (`{ getMediaItems: async () => sublists.flatMap(...) }`, each item self-describing its `providerId`) | id set → live display-grouping → sort/paginate |

The browse adapter lets the handler keep its cached multi-instance fetch (and per-instance `yearRange`/
error aggregation) while the engine owns normalize → enrich → match → combine; the handler's own
post-match step then groups the surviving items into one row per title (see
`docs/architecture/provider-roles-and-identity.md`'s browse section).

## Internals

- **`matchItems(items, filterValues, contentType)`** — the shared filter primitive: the subset
  satisfying every predicate under `getFilterDef`. An empty `filterValues` matches all items (`[].every`
  is vacuously true). Exported for direct reuse.
- **`combine`** (private) — maps each source through `matchItems`, projects source ids, runs
  `evaluateCombination` (include union minus exclude), and returns the surviving normalized items.
- Unknown `contentType` resolves to an empty `MediaItemSet`.
- Depends on [`filterRegistry`](ref:path:server/modules/media/filterRegistry.ts) (rule set) and `combinationEvaluator` (combination contract) — both
  internal domain, never mocked. DB enrichment (`mergeEnrichment`) runs when a `db` is injected.

## Registration

`mediaQueryEngine` is registered in the awilix container ([`server/container.ts`](ref:path:server/container.ts)) and injected into the
executor, the saved-query preview handler, and the media browse handler. The executor falls back to
`new MediaQueryEngine({ db })` when no engine is injected (unit tests).

## Convergence achieved

Before this engine, "which items match these filter values" was owned by three sites that disagreed:
the executor's private `applyFilters`, the browse handler's duplicated `filterViaRegistry`, and a
`/preview` that returned a hardcoded `{ count: 0 }`. Both duplicated loops are deleted; `/preview`
returns the engine's real count. All three sites now resolve through `evaluate` and cannot diverge.

## Current invariant

`MediaItemSet`'s element is the provider's normalized item, self-describing its provenance via
`_sourceIds.providerId`. The single-active-provider invariant no longer holds for `movie`/`series`
(`RADARR`/`SONARR` — the `MediaSource` role, `isMediaSourceType`): any number of instances may be active,
and `evaluate` is called once per instance by each caller that fans out (preview, per-instance browse
sublists). Every other provider type (TMDB, Overseerr, Tautulli, Plex-as-enricher, Jellyfin) keeps the
invariant — at most one active instance, so those lookups stay unambiguous.
