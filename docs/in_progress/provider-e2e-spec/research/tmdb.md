# TMDB — field/task enumeration

Research asset for `docs/in_progress/provider-e2e-spec/tickets/07-tmdb-research.md`. Exhaustive
enumeration of TMDB's API surface cross-checked against this codebase. Not curation — no field below
is recommended or ruled out; that's the follow-on decision ticket's job.

Primary sources: [developer.themoviedb.org](https://developer.themoviedb.org) reference docs for
`movie-details`, `tv-series-details`, `movie-external-ids`, `movie-videos`, `movie-images`,
`movie-recommendations`, `movie-keywords` (JS-rendered pages returned truncated schemas via fetch;
field names below cross-confirmed via search-indexed mirrors/community references of the same stable,
versioned public API). Codebase sources: `server/modules/providers/connections/tmdbProvider.ts`,
`server/modules/media/enrichment/enricherAdapters.ts`, `server/modules/media/enrichment/mediaFieldProvider.ts`,
`server/modules/media/activeFieldSet.ts`, `server/modules/media/ruleRegistry.ts`,
`server/modules/providers/ratingsAggregation.ts`, `server/modules/providers/tmdbService.ts`,
`docs/architecture/media-providers.md`, `docs/architecture/media-enrichment-eav-model.md`.

## Legend

- **wired-into-pipeline** — flows through `EnrichmentJob` onto a `MediaItem` and is filterable today.
- **implemented-but-unwired** — `tmdbProvider.ts` already fetches/parses it, but no `EnrichmentJob`
  consumer exists; it's reachable only via the separate ratings-aggregation route or `TmdbService`.
- **not-implemented-at-all** — TMDB's API exposes it; nothing in this codebase calls it yet.

## Wired-into-pipeline

| Field | Wired where |
|---|---|
| `tmdbStatus` (movie/tv release/airing status string) | `tmdbEnricher` (`server/modules/media/enrichment/enricherAdapters.ts:66-80`) calls `getStatus(tmdbId)`; declared in `EnrichmentFields` (`mediaFieldProvider.ts:22`); sole producer entry `fieldsByProviderType[TMDB] = ['tmdbStatus']` (`activeFieldSet.ts:20`); gated filter rule at `ruleRegistry.ts:433-444`. |

This is the entire wired surface. One field.

## Implemented-but-unwired (exists in `tmdbProvider.ts`, EnrichmentJob doesn't consume it)

All of these are real, working methods on `TmdbProvider` today, called only by
`ratingsAggregation.ts`/`providers.procedures.ts`'s `getRatings` route or `TmdbService`'s
trending-backdrops feature — never by `tmdbEnricher` or any `EnrichmentJob` path. None has an
`EnrichmentFields` key, so even if an enricher called these methods tomorrow, the values have nowhere
to land without a new key.

| Field | Source method | Notes |
|---|---|---|
| `certification` | `getMovieDetailsEnriched`/`getTvDetailsEnriched` (`tmdbProvider.ts:232-297`), via `extractMovieCertification`/`extractTvCertification` (`tmdbProvider.ts:149-190`) | US-preferred, falls back to first available region. **`ruleRegistry.ts:204-219`'s `certification` rule already lists `MetadataProviderType.TMDB` in `providers`** even though `fieldsByProviderType` (`activeFieldSet.ts:14-21`) has no TMDB entry for it and no enricher populates it — see "listed but not wired" section below. |
| `keywords` (string array) | same enriched-details calls, `append_to_response: 'keywords'` | No `EnrichmentFields` key at all; no filter rule references `keywords` for TMDB. |
| `collectionId` / `collectionName` (movie franchise/collection) | `getMovieDetailsEnriched` only (movie-only concept) | No `EnrichmentFields` key; no filter rule. |
| `spokenLanguages` (string array, English names) | both enriched-details calls | No `EnrichmentFields` key; no filter rule. |
| `originCountry` (string array, ISO country codes) | both enriched-details calls | No `EnrichmentFields` key; no filter rule. |
| Streaming-service flags (`netflix`/`prime`/`disney`/`hulu`/`apple`/`hbo`/`paramount`/`peacock`) | `getMovieWatchProviders`/`getTvWatchProviders` (`tmdbProvider.ts:299-314`), region-scoped, provider-id-to-flag lookup table hand-maintained at `tmdbProvider.ts:106-117` | Region-parameterized — the enricher call site would need to decide/configure a region, an additional config surface not currently modeled anywhere for TMDB. No `EnrichmentFields` key. **Naming-collision risk:** a hypothetical `streamingServices`/`watchProviders` field would need a name distinct from any future Justwatch-style or other-provider streaming field if one is ever added; flag for precedence ticket. |
| `movieRating`/`movieVotes`/`tvRating`/`tvVotes`/`popularity` (TMDB's own vote average/count, distinct from `imdbRating`) | `getRatings(title, year)` (`tmdbProvider.ts:316-365`), consumed today by `ratingsAggregation.ts` | Title-search based (not id-based), so accuracy depends on search-match quality — see `ratingsAggregation.ts:38-40`'s existing imdbId-mismatch warning logic, which already treats TMDB/OMDB disagreement as a real risk. **Naming-collision risk:** `ruleRegistry.ts` already has an `imdbRating` field owned by Radarr (`ruleRegistry.ts:281-292`, movie-only). A TMDB-sourced rating is a *different number from a different source* (TMDB's own vote average, not IMDb's) — if ever surfaced as a filter field, naming it something that reads as "the IMDB rating" (when it's actually TMDB's) would be a real collision/confusion risk, not just a string clash. Flag for precedence ticket. |
| `imdb_id` crosswalk (present on `TmdbMovieDetails`/via `getMovieDetails`) | `tmdbProvider.ts:25`, surfaced today only inside `getRatings`'s cross-check against OMDB | Not itself unwired as a *filter* concept, but notable as TMDB's own id-crosswalk capability, distinct from the full `external_ids` endpoint below which this codebase never calls. |

## Not-implemented-at-all (TMDB API exposes, `tmdbProvider.ts` never calls)

Confirmed via TMDB's `movie`/`tv` details endpoints' `append_to_response` option list and their
dedicated sub-endpoints (`developer.themoviedb.org/reference/movie-details`,
`.../tv-series-details`, and the per-append sub-endpoint pages `movie-external-ids`, `movie-videos`,
`movie-images`, `movie-recommendations`, `movie-keywords`; the same append options exist on the `tv/`
resource under `tv-*` equivalents). Every append option below is retrievable in one extra
`append_to_response` slot alongside the existing `keywords,release_dates` / `keywords,content_ratings`
calls (TMDB documents a 20-item `append_to_response` ceiling, well above current usage), so none of
these requires a new HTTP round trip to add — only new parsing/typing in `tmdbProvider.ts`.

| Field / sub-resource | What it is | Layer(s) it would touch |
|---|---|---|
| `external_ids` (`imdb_id`, `wikidata_id`, `facebook_id`, `instagram_id`, `twitter_id`, plus TV-side `tvdb_id`) | Id crosswalk endpoint (`movie/{id}/external_ids`, `tv/{id}/external_ids`) | Provider field (new parse in `tmdbProvider.ts`); potential **structural** consideration — `tvdb_id` on the TV side is a genuine crosswalk to Sonarr's own id space (see `media_identity`'s `tvdbId` — confirm exact column name before building); this is the one candidate in this whole doc that could plausibly want a schema column rather than an EAV `enrichment_field` seed row, since it's an identity-matching key, not a display fact. Flag, don't design. |
| `recommendations` (paginated list of related movie/show ids+titles) | `movie/{id}/recommendations`, `tv/{id}/recommendations` | New provider method; no current UI/filter concept for "related items" exists anywhere in `ruleRegistry.ts` — would be a new query-engine/UI shape, not just a new field on an existing item. |
| `similar` (paginated list, distinct algorithm from `recommendations` — genre/keyword-similarity vs. user-behavior-based) | `movie/{id}/similar`, `tv/{id}/similar` | Same shape as `recommendations` above; **naming-collision risk** between the two if both were ever built as one feature — TMDB itself treats them as distinct, non-interchangeable endpoints. |
| `videos` (trailers/teasers/clips/featurettes; fields include `key`, `site` (YouTube/Vimeo), `type`, `official`, `published_at`, `iso_639_1`/`iso_3166_1`) | `movie/{id}/videos`, `tv/{id}/videos` | Provider field/UI surface (e.g., "has trailer" filter, or trailer-link display) — no current concept in this codebase; distinct from `TmdbService`'s existing trending-backdrops feature, which pulls stills, not video links. |
| `images` (`backdrops`, `posters`, `logos` arrays, each with `file_path`, dimensions, `vote_average`, `iso_639_1`) | `movie/{id}/images`, `tv/{id}/images` | Overlaps conceptually with `TmdbService`'s existing trending-backdrops feature (`server/modules/providers/tmdbService.ts`), which already builds full backdrop URLs from `image.tmdb.org` — a per-item images call is a different capability (per-media-item art, not homepage trending) but shares the base-URL/sizing logic; **naming-collision risk** with a future Plex-native "poster"/"artwork" concept if either provider's images ever get filterable. |
| `credits` (cast/crew) | `movie/{id}/credits`, `tv/{id}/credits`, `tv/{id}/aggregate_credits` (season-aware cast rollup, TV-only) | New provider field; would be the first "people" data type in this codebase — no analogous field on any other provider today, likely a genuinely new UI/filter concept (actor/director search), not a slot-in to an existing rule shape. |
| `reviews` | `movie/{id}/reviews`, `tv/{id}/reviews` | User-generated text content — new provider field; no display surface exists for free-text reviews anywhere in this app today. |
| `translations` | `movie/{id}/translations`, `tv/{id}/translations` | Localized title/overview per language; provider field only if i18n display is ever a goal — no current i18n concept in `ruleRegistry.ts`/UI. |
| `alternative_titles` | `movie/{id}/alternative_titles`, `tv/{id}/alternative_titles` | Region-specific alternate titles; provider field, marginal utility beyond search-matching (could improve `getRatings`'s title-search accuracy, noted above as already a known weak point). |
| `release_dates` full per-region table (already fetched for US-preferred certification, but the *other* regions' dates/types are discarded) | Already inside `getMovieDetailsEnriched`'s existing `release_dates` append call — `extractMovieCertification` only ever returns one region's value | Not a new API call — a **parsing gap**, not a missing capability. Per-region certification (e.g., separate US/UK/DE certification filters) would need `tmdbProvider.ts` to return the full per-region map instead of the collapsed single string it does today. Flag as a structural shape question: today's `certification` `EnrichmentFields`/filter concept is single-valued; multi-region certification wouldn't fit that shape without a design change (not necessarily a DB schema change under the EAV model, but definitely an `EnrichmentFields` type/shape change). |
| `content_ratings` full per-region table (TV side, same gap as `release_dates` above) | Already inside `getTvDetailsEnriched`'s `content_ratings` append call | Same parsing-gap flag as above. |
| Trending/popular/top-rated/upcoming discovery endpoints (`trending/movie/{time_window}`, `movie/popular`, `movie/top_rated`, `discover/movie`) | Bulk discovery, distinct from per-id lookups | `TmdbService` already uses `trending/movie/day` for backdrops — everything else in this bucket (`discover`, `popular`, `top_rated`) is unused. Would be a new automation/task shape (e.g., "suggest new acquisitions"), not an enrichment field — flag as a possible task/actuator or automation-option candidate for the decision ticket, distinct in kind from every field-shaped item above. |

## The central open question: `ruleRegistry.ts`'s "listed but not wired" TMDB entries

`ruleRegistry.ts` already declares `MetadataProviderType.TMDB` as a `providers` entry for
three rules, **despite no enricher populating any of them from TMDB today**:

- `year` — `ruleRegistry.ts:136-148` (`providers` includes `RADARR, SONARR, PLEX, TMDB`)
- `certification` — `ruleRegistry.ts:204-219` (`providers` includes `RADARR, SONARR, TMDB, OMDB`)
- `genres` — both the movie rule (`ruleRegistry.ts:268-279`, Radarr-only, no TMDB) and the show rule
  (`ruleRegistry.ts:346-356`, `providers: [SONARR, TMDB]`)

Cross-checked against `activeFieldSet.ts:14-21`'s `fieldsByProviderType`: TMDB's only declared
producer entry there is `['tmdbStatus']`. That table is the compile-time source of truth
`deriveProviders` (used elsewhere in `ruleRegistry.ts`) reads from — but `year`/`certification`/
`genres` don't use `deriveProviders` for their TMDB entry; they hand-list
`MetadataProviderType.TMDB` directly in the rule's own `providers` array, bypassing that
compile-time check entirely. So there are two independent copies of "does TMDB own this field" today
(the hand-list in `ruleRegistry.ts` and the derived table in `activeFieldSet.ts`), and they already
disagree for all three fields.

**This ticket does not resolve it — presenting both branches for the decision ticket:**

1. **Wire it for real** — `tmdbEnricher` (`enricherAdapters.ts`) starts calling
   `getMovieDetailsEnriched`/`getTvDetailsEnriched` in addition to `getStatus`, `EnrichmentFields` gains
   a `certification`/`genres` (and possibly `year`, though TMDB's `release_date`/`first_air_date` would
   need a year-extraction step not currently in `tmdbProvider.ts`) key, `activeFieldSet.ts`'s
   `fieldsByProviderType[TMDB]` is extended to match, and the `ruleRegistry.ts` `providers`
   hand-lists become accurate. Under the EAV model (`docs/architecture/media-enrichment-eav-model.md`)
   this is a migration seed row per new key, not a schema/column change — cheap structurally, but real
   product-precedence work: Radarr/Sonarr already own `genres`/`certification` as source-provider fields
   (`docs/architecture/media-providers.md`'s Radarr/Sonarr sections), so wiring TMDB as a second producer
   raises the exact same precedence question `contestedFieldPrecedence` already solves for
   Plex-vs-Tautulli — deliberately left to the precedence ticket, not decided here.
2. **Correct the stale registry entry** — remove `MetadataProviderType.TMDB` from these three rules'
   `providers` arrays, since nothing populates them from TMDB today and the entries currently
   describe a plausible future source, not a wired one (this is exactly the wording
   `docs/architecture/media-providers.md`'s TMDB section already uses to characterize the gap).

## Structural-schema-change flags (summary)

- **`external_ids`' TV-side `tvdb_id`** (not-implemented-at-all section) — the one field in this
  enumeration that looks like an identity/crosswalk key rather than a display fact; could plausibly
  want to interact with `media_identity`'s existing id-matching columns rather than land as an EAV
  `enrichment_field` row. Flagged, not designed.
- **Per-region `certification`/`content_ratings`** (currently collapsed to a single string by
  `extractMovieCertification`/`extractTvCertification`) — not a DB schema change under EAV, but an
  `EnrichmentFields`-shape change (single string vs. per-region map) if multi-region filtering is ever
  wanted. Flagged.
- Everything else in the implemented-but-unwired and not-implemented-at-all buckets is EAV-shaped
  (new `enrichment_field` seed rows), consistent with `docs/architecture/media-enrichment-eav-model.md`'s
  point that adding a field under the current model is "a seed row in a migration, never a schema
  change" — no other structural DB change identified.

## Naming-collision flags (summary)

- TMDB's own rating (`getRatings`'s `movieRating`/`tvRating`, TMDB's vote average) vs. the existing
  Radarr-owned `imdbRating` filter field — different source, different number, collision risk is in
  *meaning* if a TMDB rating field is ever named/labeled ambiguously.
- `recommendations` vs. `similar` — TMDB itself treats these as two distinct, non-interchangeable
  endpoints; a single "related items" feature conflating them would misrepresent TMDB's own semantics.
- Streaming-service flags (`getMovieWatchProviders`/`getTvWatchProviders`) — no current collision, but
  any future non-TMDB streaming-availability source would need a distinct field name from day one.
- TMDB per-item `images` vs. `TmdbService`'s existing trending-backdrops feature and any future
  Plex-native artwork concept — three different "image" ideas (trending homepage backdrops, per-item
  art, Plex library art) that could collide under a generic `images`/`artwork` name if built without
  care.
