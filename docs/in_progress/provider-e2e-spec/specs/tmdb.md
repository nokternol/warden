---
type: wayfinder-spec
label: wayfinder:spec
provider: tmdb
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/07-tmdb-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/tmdb.md
---

# TMDB — E2E spec

TMDB is a `MediaEnricher` today wired for exactly one field (`tmdbStatus`), despite `ruleRegistry.ts`
already hand-listing it as a `providers` entry on three other rules (`genres`, `certification`,
`year`) that nothing populates — a stale-entry bug this spec resolves by wiring for real rather than
correcting the listing. Applies the same standing principles as every provider this map: per-item
fields only, and genuine redundancy across independently-configured sources is valuable (TMDB's own
direct API calls are treated as a *more* authoritative path than the same TMDB data reached indirectly
through Radarr's bundled ratings pull — see "same-source dedup" below, not a new-redundancy case).

## Prerequisite: system-wide region setting (structural — new table)

**No system-wide settings mechanism exists anywhere in this codebase today** — only per-provider
`metadataProviders.settings` JSON blobs. A single `region` setting (ISO 3166-1 alpha-2 country code)
is needed to drive two TMDB capabilities below (streaming-service flags, region-selected
certification) and is deliberately modeled as a **new system-wide settings table**, not folded into
TMDB's own provider settings — the region concept isn't TMDB-specific even though TMDB is its first
consumer. This is the one genuinely structural item in this spec; flagged as a blocker to raise, not
designed further here (table shape is an implementation decision, not a spec-ticket one).

## Fields already wired (unchanged baseline)

`tmdbStatus` (movie/tv release/airing status string).

## Same-source dedup (not new redundancy — TMDB direct call outranks the Radarr-bundled copy)

Radarr's `collection.{name,tmdbId}` (wired last session as `collectionName`/`collectionTmdbId`) is
the *same underlying TMDB data*, reached indirectly through Radarr's own API bundle rather than
TMDB's API directly. Unlike Plex/Jellyfin/TMDB's genuinely independent metadata (different configured
sources, real redundancy value), this is one source reached two ways — same treatment as
Tautulli-on-Plex. TMDB's own direct call becomes the additional/primary producer of the *same*
field, not a new field:

| Domain field | Source |
|---|---|
| `collectionName` / `collectionTmdbId` | `getMovieDetailsEnriched` — TMDB direct call outranks Radarr's bundled copy |

**Ratings extracted to a dedicated intent doc**: `getRatings()`'s `movieRating`/`tvRating`/vote counts
(the same same-source-dedup reasoning applies — TMDB's direct call outranks Radarr's bundled
`ratings.tmdb` copy) moved to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) as
`tmdbRating`/`tmdbRatingVotes`, alongside the full per-provider ratings inventory and the reasoning
for why ratings don't fit this spec's shared-EnrichmentFields pattern.

## New fields to wire — shared (TMDB becomes an additional producer, precedence flagged for the final ticket)

| Domain field | Source | Shared with |
|---|---|---|
| `genres` | `getMovieDetailsEnriched`/`getTvDetailsEnriched` | Radarr (movie), Sonarr (show), Plex, Jellyfin |
| `certification` | same calls, region-selected via the `region` setting (replaces today's hardcoded US-preferred fallback) | Radarr, Sonarr, OMDB, Plex, Jellyfin |
| `year` | same calls (needs a year-extraction step from `release_date`/`first_air_date`, not currently in `tmdbProvider.ts`) | Radarr, Sonarr, Plex |
| `originCountry` | same calls | OMDB's `Country` (see `specs/omdb.md`) |

## New fields to wire — no current collision

| Domain field | Source | Notes |
|---|---|---|
| `keywords` | same calls, `append_to_response: 'keywords'` (already fetched) | String array — "contains keyword X" filter. |
| `spokenLanguages` | same calls | String array — language filter. |
| `hasTrailer` | `movie/{id}/videos`, `tv/{id}/videos` | Boolean derived from presence of a trailer-type video — filterable. The actual video links/metadata are on-demand, not enrichment (see below). |
| Streaming-service flags (`netflix`/`prime`/`disney`/`hulu`/`apple`/`hbo`/`paramount`/`peacock`) | `getMovieWatchProviders`/`getTvWatchProviders`, region-scoped via the new `region` setting | Booleans per service, filterable ("available on Netflix"). |

## Identity crosswalk (not enrichment — parallels Sonarr's imdbId/tvMazeId treatment)

`external_ids` (`imdb_id`, `tvdb_id`, `wikidata_id`, `facebook_id`, `instagram_id`, `twitter_id`) is
an id-matching capability, not display/filter data. `tvdb_id` specifically cross-verifies Sonarr's own
id space. Wired as `_sourceIds` cross-checks, not `EnrichmentFields`.

## On-demand item-detail metadata (not enrichment)

**Refined principle from this session, applied retroactively to `specs/plex.md`/`specs/jellyfin.md`
too**: data nobody would filter on is on-demand item-detail metadata — fetched when a user views one
specific item, not pre-computed for every item in a batch `EnrichmentJob`. Capture as a JSDoc note on
the relevant `tmdbProvider.ts` methods flagging them as candidates for a future "full item detail"
provider method/role, not built this pass:

- `credits` (cast/crew) — also the first "people" data type in this codebase; no relational shape
  exists for it anywhere, same class as Jellyfin's deferred `People`.
- `reviews` — user-generated text, no display surface exists today.
- `translations` / `alternative_titles` — i18n, no current i18n concept in this app.
- `recommendations` / `similar` — per-item but produce a *list of other items*, a different
  query-engine shape than every existing filter field; TMDB treats these as two distinct,
  non-interchangeable algorithms, don't conflate if this is ever built as a real feature.
- `images` (backdrops/posters/logos) — display only, moved here after being briefly scoped as
  enrichment and immediately reclassified per the "never filtered on" test.

## Out of scope (not per-item)

- **Trending/popular/top-rated/discover endpoints** (`trending/movie/{time_window}`, `movie/popular`,
  `movie/top_rated`, `discover/movie`) — bulk discovery, not scoped to one item. `TmdbService` already
  uses `trending/movie/day` for its own homepage-backdrops feature (unrelated to this spec). A
  possible future "suggest new acquisitions" automation, not an enrichment field — flagged, not
  designed.

## Tasks / automation options

None. TMDB is read-only metadata; no `MediaActuator` role is plausible.

## Naming-collision notes (for the final precedence ticket)

- **`genres`/`certification`/`year`** — TMDB joins existing multi-producer rules; makes the current
  stale `ruleRegistry.ts` listing accurate. Precedence order not decided here.
- **`hasTrailer`/streaming flags** vs any future non-TMDB streaming-availability or video source —
  no current collision, flagged for whoever builds a second source later.
- **`images`** vs `TmdbService`'s existing trending-backdrops feature and any future Plex/Jellyfin
  artwork concept — three different "image" ideas that could collide under a generic name if ever
  built without care. Currently none of the three is a real filterable field, lowering urgency.

## Filter type mapping

Tasks: N/A — no tasks (spec's own "Tasks / automation options" section: "None. TMDB is read-only
metadata; no `MediaActuator` role is plausible.").

`tmdbStatus` is already wired in `ruleRegistry.ts` — not revisited here.

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `genres` | `genres` | `csv-strings` | Joins the existing shared `genres` rule (movie and show variants both already `csv-strings`) as an additional producer — TMDB was already hand-listed in `providers` with nothing populating it; this wiring makes that listing accurate, per the spec's own framing. No new key. |
| `certification` | `certification` | `csv-strings` | Joins the existing shared `certification` rule (`csv-strings`, already lists TMDB in `providers`). No new key. |
| `year` | `year` | `range` | Joins the existing shared `year` rule (`range` over the numeric year, already lists TMDB in `providers`). No new key — not a date; consistent with the "dates are `range`, never a raw picker" convention already covering this field. |
| `originCountry` | `originCountry` | `csv-strings` | New key. String array on the item (ISO country codes from TMDB `origin_country`); matches the existing `csv-strings` convention for multi-select-by-string-value filters (same shape as `genres`, `network`). Spec notes a future collision with OMDB's `Country` (`specs/omdb.md`) — not resolved here, precedence is a final-ticket concern. |
| `keywords` | `keywords` | `csv-strings` | New key. String array (TMDB keyword tags), same shape as `genres` — multi-select "contains keyword X" is exactly the `csv-strings` use case. |
| `spokenLanguages` | `spokenLanguages` | `csv-strings` | New key. String array (language codes/names) — same reasoning as `keywords`/`originCountry`. |
| `hasTrailer` | `hasTrailer` | `boolean` | New key. Derived boolean (presence of a trailer-type video), same shape as `hasFile`/`watched` — a single true/false predicate, not a range or string set. |
| Streaming-service flags (`netflix`, `prime`, `disney`, `hulu`, `apple`, `hbo`, `paramount`, `peacock`) | `streamingNetflix`, `streamingPrime`, `streamingDisney`, `streamingHulu`, `streamingApple`, `streamingHbo`, `streamingParamount`, `streamingPeacock` | `boolean` (×8) | New keys — 8 separate boolean rules, not 1 `csv-strings` "available on any of" rule. The domain data is 8 independent per-service booleans (spec: "Booleans per service, filterable"), not a string array on the item; collapsing them into one `csv-strings` rule would require synthesizing an `availableOn: string[]` field TMDB doesn't naturally produce, and would only support OR-style "available on any of X, Y" queries — it can't express "available on Netflix AND Disney," which independent boolean rules can (combine multiple rules). Matches the existing convention for independent boolean facts (`watched`, `monitored`, `ended`, `hasFile`) rather than inventing a new aggregate shape. |
| `external_ids` (`imdb_id`, `tvdb_id`, `wikidata_id`, `facebook_id`, `instagram_id`, `twitter_id`) | — none — | — | Identity crosswalk, not filter data — per the spec's own framing, these are id-matching/cross-verification keys (`_sourceIds`), never independently filtered on. No filter mapping. |
| `collectionName` / `collectionTmdbId` | — none (out of this table) — | — | Same-source dedup, not a new field — TMDB becomes an additional producer of the already-handled `collectionName`/`collectionTmdbId` fields from a prior session. Out of scope here per the task's instruction to skip "Same-source dedup" section fields. |
| `tmdbRating` / `tmdbRatingVotes` and other ratings | — none (out of this table) — | — | Extracted to `docs/intent/media-ratings-provider.md` in a prior session; out of scope here per the task's instruction to skip the "Ratings extracted" section. |
| `credits`, `reviews`, `translations`/`alternative_titles`, `recommendations`/`similar`, `images` | — none — | — | On-demand item-detail metadata per the spec's own "not enrichment" classification — never batch-enriched, never filtered on. No filter mapping. |
| Trending/popular/top-rated/discover endpoints | — none — | — | Bulk discovery, not per-item data — spec's own "Out of scope (not per-item)" section. No filter mapping. |

## UI decisions

No `/prototype` session needed — every filterable field maps onto a `RuleControl` renderer already
established across the six prior UI passes (`range` → `NumberRangeFilter`, `csv-strings` →
`StringMultiSelectDropdown`, `boolean` → `OptionFilter`). No tasks exist for TMDB (confirmed: "Tasks:
N/A — no tasks" above), so nothing goes to `11-automation-task-parameters` this ticket, unlike every
prior provider's UI pass.

### `genres` / `certification` / `year` — confirmed as joining, no new key/route/widget

TMDB becomes an additional producer on all three already-shared rules (`csv-strings`, `csv-strings`,
`range` respectively). No control decision to make — `RuleControl` already renders these for
Radarr/Sonarr/Plex/Jellyfin/(Tautulli for some); TMDB just adds to `providers`, resolving the
stale `ruleRegistry.ts` listing this whole spec exists to fix. `genres` continues to resolve
through the existing `listGenres`-shaped lookup; `certification` remains the one live `csv-strings`
rule with no lookup source (pre-existing gap flagged by Plex's and every subsequent UI pass — not
TMDB's to fix).

### `originCountry` — (b): hardcoded fixed-array branch in `csvStringOptions`, not a `Lookups` route

ISO 3166-1 alpha-2 country codes are a closed, well-known, externally-standardized vocabulary — not
runtime library data that grows or varies per instance the way `network`/`overseerrRequestedBy` do.
The set is larger than Overseerr's 4-value `overseerrIssueType` precedent (~250 codes vs. 4), but
size alone doesn't change the shape: it's still fixed, enumerable ahead of time, and identical across
every TMDB-configured instance, which is exactly the test `overseerrIssueType`'s decision established
("provider's own fixed API vocabulary," not "small"). Routing ~250 unchanging values through a
`/api/media/*` fetch would be pure overhead for zero per-instance variance — nothing to look up.

**Decision**: `csvStringOptions` gets a new branch returning a hardcoded ISO-3166-1 country list
(code + display name pairs collapsed to the code strings `csv-strings` expects, e.g. sourced from a
static table, not a live call):

```
if (rule.key === 'originCountry') return ISO_COUNTRY_CODES; // fixed ~250-entry array
```

No new `Lookups` field, no new route. (Display label mapping from code → country name, if wanted in
the dropdown, is a rendering-layer concern for `StringMultiSelectDropdown` generally, not specific to
this field — out of scope for a filter-shape decision.)

**Naming note carried to OMDB**: this key is `originCountry`, already used verbatim in
`specs/omdb.md`'s mapping table ("Joins the `originCountry` rule minted by `specs/tmdb.md`... No new
key"). OMDB's own `Country` field is a *single* string (per OMDB's API shape) joining this same
multi-value `csv-strings` rule as an additional producer — no widget mismatch, but flag for OMDB's UI
ticket that a single-value producer feeding a multi-select rule needs to wrap its one value as a
one-element array at the query-engine layer, not a UI-layer concern but worth naming so OMDB's ticket
doesn't rediscover it.

### `keywords` — (a): dedicated `Lookups`-backed route

Keywords are open, per-item, unbounded tags — TMDB's keyword vocabulary runs into the thousands and
grows with every new title added to the library, the same shape as Plex's `plexLabels` and Jellyfin's
`Tags`, both of which got dedicated `Lookups` routes in their UI passes. A hardcoded array is not
possible here (unlike `originCountry`, there is no fixed enumeration to hardcode).

**Decision**: new `Lookups.tmdbKeywords: string[]` field, new `csvStringOptions` branch (`if
(rule.key === 'keywords') return lookups.tmdbKeywords;`), new `/api/media/tmdb-keywords` route in
`useMediaLookups.ts` returning the distinct set of keyword tags seen across the library's
TMDB-enriched items, following the `listGenres`/`listNetworks` dedupe-and-sort pattern (same
mechanism `overseerrRequesters` used for Overseerr's open per-instance value set). Checked all six
prior UI passes' "UI decisions" sections for an existing tag/keyword-shaped route to reuse — none
exists; Plex's `plexLabels` and Jellyfin's `Tags` are separate, provider-specific tag spaces (Plex
labels are user-applied library tags, Jellyfin `Tags` likewise) with no semantic overlap to TMDB's
editorially-curated keyword vocabulary, so this is a genuinely new route, not reuse of an existing
one.

### `spokenLanguages` — (b): hardcoded fixed-array branch, same reasoning as `originCountry`

Language codes (ISO 639-1, what TMDB's `spoken_languages` field actually returns) are the same shape
as `originCountry`: a closed, externally-standardized vocabulary, not per-instance runtime data.
Same decision, same mechanism:

```
if (rule.key === 'spokenLanguages') return ISO_LANGUAGE_CODES; // fixed array
```

No new `Lookups` field, no new route. Unlike `originCountry`, no known future collision to flag —
noted in the spec's own "Naming-collision notes" as having none.

### `hasTrailer` — confirmed `boolean`, new `BOOLEAN_VALUE_LABELS` entry

Same shape as `overseerrHasIssue`/`overseerrHasComments`. Generic "Yes"/"No" would read ambiguously
in an active-filter chip out of context. Add:

```
hasTrailer: ['Has Trailer', 'No Trailer'],
```

### Streaming-service flags (×8) — confirmed independent `boolean` rules, all 8 need labels

Per the decision ticket (already settled, executing not re-litigating): 8 independent per-service
booleans, not one `csv-strings` "available on any of" rule, since the underlying domain data is 8
genuinely independent per-item facts and independent boolean rules are the only shape that can
express an AND query ("on Netflix AND Disney"), matching the existing convention for independent
boolean facts (`watched`, `monitored`, `ended`, `hasFile`). All 8 need `BOOLEAN_VALUE_LABELS` entries
— 8 generic "Yes"/"No" toggles in a filter list would be unreadable (indistinguishable from each
other by chip alone). Add:

```
streamingNetflix: ['On Netflix', 'Not on Netflix'],
streamingPrime: ['On Prime Video', 'Not on Prime Video'],
streamingDisney: ['On Disney+', 'Not on Disney+'],
streamingHulu: ['On Hulu', 'Not on Hulu'],
streamingApple: ['On Apple TV+', 'Not on Apple TV+'],
streamingHbo: ['On Max', 'Not on Max'],
streamingParamount: ['On Paramount+', 'Not on Paramount+'],
streamingPeacock: ['On Peacock', 'Not on Peacock'],
```

(`streamingHbo`'s label says "Max," not "HBO Max" — TMDB's watch-provider data reflects the current
service branding; the domain field name stays `streamingHbo` since that's the filter key already
named in the mapping table above, only the display copy reflects the rename.)

### Summary of corrections to the "Filter type mapping" table above

None. Every row's `dataType` classification in the mapping table is confirmed as-is; this section
adds the options-source mechanism (a vs. b) and label copy the mapping table left open, not a
reclassification.
