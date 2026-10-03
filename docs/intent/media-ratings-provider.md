# MediaRatingsProvider role

**Status:** INTENT (future state, not built). Extracted from the provider-e2e-spec map's
per-provider decision sessions (`docs/in_progress/provider-e2e-spec/`) after ratings kept
resurfacing scattered across Radarr, Sonarr, Plex, Jellyfin, TMDB, OMDB, and TVMaze's specs with
inconsistent treatment — some folded into the shared multi-producer `EnrichmentFields` pattern used
for genres/certification/studio, some kept provider-prefixed and separate, one deferred outright.
This doc is the single place that inventory now lives; the per-provider specs point here instead of
each carrying its own ratings-field definitions.

## Why ratings don't fit the shared-EnrichmentFields pattern

Every other multi-producer field this map decided (`genres`, `certification`, `studio`, `network`,
file-technical-metadata) works by picking one winning value per item via `contestedFieldPrecedence`
— a single scalar wins, the losing producers' values are discarded. That's the right shape when
"whichever source is most reliable" is genuinely the question. It's the wrong shape for ratings:

- Different rating sources use **different, non-convertible scales** (IMDb 0–10, Rotten Tomatoes
  0–100%, Metacritic 0–100, TMDB's own vote average 0–10 but a different underlying vote population
  than IMDb's). Picking a single "winner" throws away real signal a blended/weighted view would keep.
- The existing ad hoc precursor to this role, `ratingsAggregation.ts`'s `aggregateRatings()`, already
  does something closer to the right shape — it **averages** TMDB/OMDB/TVMaze values rather than
  picking one winner — but it's title-keyed (not item-identity-keyed), on-demand only (feeds one ad
  hoc `/ratings` route + the `RatingsDisplay` client component), and not persisted anywhere. It's the
  right instinct without the right home.
- A future computed/blended rating (weighted by source reliability, vote count, recency) is
  **genuinely owned by this product** even though every input is sourced elsewhere — that's a
  different kind of artifact than "Radarr's `genres` value, chosen over Sonarr's because Radarr is
  more reliable for movies."

## Proposed shape (not designed in detail — this is intent, not a spec)

A `MediaRatingsProvider` role with its own persistence, distinct from both `NormalizedMovie`/
`NormalizedSeries`'s scalar fields and the `media_enrichment` EAV table:

- One row per (media identity, source system, rating kind) — e.g. (item X, IMDb, `imdbRating`), (item
  X, Rotten Tomatoes, `rottenTomatoesRating`), (item X, TMDB, `tmdbRating`) — not one row per item with
  a single winning scalar. This is what "clearly keyed so they can be grouped, weighted, computed"
  requires: the raw per-source values need to survive independently, not collapse into one field via
  precedence the way genre/certification do.
- A blending/computation step (weighted average, source-reliability weighting, vote-count weighting)
  produces a derived "the product's own rating" — analogous to what `aggregateRatings()` already does
  informally, but item-identity-keyed and persisted rather than title-keyed and on-demand.
- Table shape, weighting algorithm, and whether/how it replaces `ratingsAggregation.ts` are **not
  decided here** — genuinely untested territory per the session that raised this, "for much later."
  This doc records the problem and the per-provider inventory, not the solution.

## Explicitly out of scope for this role

- **`certification`** (content rating board classification — PG-13, TV-MA, etc.) — a categorical
  classification, not a blendable numeric score. Stays in the regular shared-`EnrichmentFields`
  precedence pattern like `genres`/`studio`, unaffected by this doc.
- **`awardWinner`/`oscarWinner`** (OMDB, boolean flags derived from regexing `Awards` text) —
  award-signal booleans, not numeric ratings. Plausible future input to a blending algorithm's
  weighting, but not itself a rating value; stays a regular OMDB `EnrichmentFields` entry.
- **`BoxOffice`** (OMDB) — financial data, unrelated to ratings; already deferred as on-demand
  item-detail metadata in `specs/omdb.md` for unrelated reasons.

## Per-provider ratings inventory

Consolidated from every provider spec's ratings-related fields. "Status" reflects each spec's
decision at the time this doc was written, not a state this doc changes.

| Provider | Field(s) | Scale | Status |
|---|---|---|---|
| Radarr | `imdbRating` | IMDb 0–10 | **Already live** — wired today, movie-only, `filterRegistry.ts`'s `imdbRating` rule. |
| Radarr | `imdbVotes` | vote count | Spec'd (`specs/radarr.md`), not yet built. |
| Radarr | `tmdbRating` | TMDB 0–10 | Declared on `NormalizedMovie` today but **orphaned/unpopulated** — no source writes it yet. Spec'd via Radarr's bundled `ratings.tmdb` pull, superseded as primary producer by TMDB's own direct call (see below). |
| Radarr | `tmdbRatingVotes` | vote count | Spec'd, not yet built. |
| Radarr | `metacriticRating` / `metacriticVotes` | Metacritic 0–100 | Spec'd (`specs/radarr.md`), collision with OMDB's own Metacritic value. |
| Radarr | `rottenTomatoesRating` / `rottenTomatoesVotes` | RT 0–100% | Spec'd, collision with OMDB's own RT value. |
| Radarr | `traktRating` / `traktVotes` | Trakt scale (unconfirmed range) | Spec'd, no known collision. |
| Sonarr | `communityRating` | Sonarr's own 0–10 | **Already live** — wired today, series-only, `filterRegistry.ts`'s `communityRating` rule. |
| Sonarr | `communityRatingVotes` | vote count | Spec'd (`specs/sonarr.md`), not yet built. |
| Plex | `plexRating` / `plexAudienceRating` | Opaque — whatever the configured metadata agent supplies | Spec'd (`specs/plex.md`), kept provider-prefixed by design (scale/provenance too agent-dependent to merge into any specific-scale field). |
| Jellyfin | `jellyfinCommunityRating` / `jellyfinCriticRating` | Opaque, same reasoning as Plex | Spec'd (`specs/jellyfin.md`), kept provider-prefixed by design. |
| TMDB | `tmdbRating` / `tmdbRatingVotes` | TMDB 0–10 | Spec'd (`specs/tmdb.md`) — same underlying data as Radarr's bundled copy, TMDB's own direct API call decided as the higher-precedence producer of this field ("same-source dedup," not new redundancy). |
| OMDB | `imdbRating` / `imdbVotes` | IMDb 0–10 | Spec'd (`specs/omdb.md`) — same named metric as Radarr's, two paths to the same concept. |
| OMDB | `rottenTomatoesRating` / `rottenTomatoesVotes` | RT 0–100% | Spec'd, second producer alongside Radarr's bundled copy. |
| OMDB | `metacriticRating` / `metacriticVotes` | Metacritic 0–100 | Spec'd, second producer alongside Radarr's bundled copy. Self-collision note: OMDB exposes the same number twice (`Ratings[]` entry and a separate top-level `Metascore` field) — only `Ratings[]` should ever be parsed. |
| TVMaze | `rating.average` | TVMaze 0–10 | **Explicitly deferred, not spec'd as an `EnrichmentFields` entry** (`specs/tvmaze.md`). Already consumed by `ratingsAggregation.ts`'s blended average; that usage is unchanged by this doc. `TvMazeProvider`'s rating read site carries a JSDoc note pointing here, per the requirement that this intent survive `docs/in_progress/`'s eventual deletion. |

## Naming-confusion risk, not just a field collision

`tmdbRating`/`tmdbRatingVotes` is explicitly **not an IMDb number** despite three "rating" fields
now circling the same conceptual space (Radarr/OMDB's shared `imdbRating`, TMDB's own vote average,
Plex/Jellyfin's opaque agent-dependent ratings). TMDB's number comes from a different vote population
than IMDb's. Whatever UI eventually surfaces a blended/computed rating from this role must not label
TMDB's contribution as if it were an IMDb score — a real confusion risk, not just a naming
housekeeping item, if source labeling is ever dropped or generalized away in a "Rating: X" display.

## Relationship to `ratingsAggregation.ts`

`aggregateRatings()` (`server/modules/providers/ratingsAggregation.ts`) already blends TMDB/OMDB/
TVMaze ratings today — title-keyed, on-demand, simple unweighted average, feeding one ad hoc
`/ratings` route and the `RatingsDisplay` client component. It is the closest existing thing to this
role and is the most likely candidate to be superseded or absorbed by it eventually. Whether it gets
replaced outright, kept as a lighter on-demand preview alongside a persisted `MediaRatingsProvider`,
or something else — **not decided here**.
