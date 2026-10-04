---
type: wayfinder-spec
label: wayfinder:spec
provider: omdb
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/08-omdb-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/omdb.md
---

# OMDB — E2E spec

OMDB is completely inert today — `OmdbProvider` implements none of `MediaSource`/`MediaEnricher`/
`MediaActuator`, consumed only by an ad hoc `ratingsAggregation.ts` route outside the enrichment
pipeline. This spec turns it into a real `MediaEnricher`. Same standing principles as every provider
this map: per-item fields only, genuine cross-provider redundancy is valuable for well-defined
concepts, and data nobody would filter on is on-demand item-detail metadata, not enrichment.

## Reliability fix: switch to ID-based lookup

OMDB's lookup is title-based today (`t=`), which `ratingsAggregation.ts` already treats as
mismatch-prone (it has a defensive `imdbId` cross-check against TMDB and logs a warning on
disagreement). `NormalizedMovie._sourceIds.imdb` is already populated from Radarr with **zero new
schema needed**. Fix: `i=<_sourceIds.imdb>` when available (eliminates the title-mismatch risk
entirely), falling back to today's `t=` title search only when no IMDb id is known.

## New fields to wire — shared (OMDB becomes an additional producer, precedence flagged for the final ticket)

| Domain field | Source | Shared with |
|---|---|---|
| `certification` | `Rated` (currently unparsed — a double gap: not parsed *and* not wired) | Radarr, Sonarr, TMDB, Plex, Jellyfin. OMDB's `Rated` is a single US-centric value (no per-region table like TMDB's), contributes as one producer among the now region-aware `certification` field rather than itself being region-selectable. |
| `genres` | `Genre` (currently unparsed) | Radarr, Sonarr, TMDB, Plex, Jellyfin |
| `runtime` | `Runtime` (currently unparsed) | Radarr, Plex, Jellyfin |
| `originCountry` | `Country` (typed in `OmdbResponse` but never read) | TMDB (new field, see `specs/tmdb.md`) |

Already-parsed, now wired into the pipeline for the first time (previously computed but never fed
into `EnrichmentJob`):

| Domain field | Source | Notes |
|---|---|---|
| `awardWinner` / `oscarWinner` | regex over `Awards` text | Booleans, already derived — genuinely filterable ("award winner: yes/no"), unlike the raw text itself. Award-signal booleans, not a numeric rating — stays a regular OMDB `EnrichmentFields` entry, explicitly excluded from the ratings-role extraction below. |

## Ratings extracted to a dedicated intent doc

`imdbRating`/`imdbVotes`, `Ratings[]`'s Rotten Tomatoes entry (`rottenTomatoesRating`/
`rottenTomatoesVotes`), and `Ratings[]`'s Metacritic entry (`metacriticRating`/`metacriticVotes` —
**not** the separate top-level `Metascore` field, which duplicates the same number) all moved to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md). Unlike
Plex/Jellyfin's opaque agent-dependent "rating" fields, these are unambiguous well-defined scales —
genuine candidates for eventual shared treatment, but per this session's direction, ratings broadly
need a dedicated `MediaRatingsProvider`-backed table rather than living in `EnrichmentFields` at all.
See that doc for the full per-provider inventory and collision notes (OMDB's `imdbRating` vs.
Radarr's vs. TMDB's non-equivalent "rating", the Metacritic self-collision).

## On-demand item-detail metadata (not enrichment)

Same refined principle as `specs/tmdb.md`: data nobody would filter on is on-demand, JSDoc-noted on
`omdbProvider.ts` for a future "full item detail" capability, not batch-computed:

- `Director`, `Writer`, `Actors` — flat comma-joined strings (not TMDB's structured relational
  credits), no existing filter-by-person infrastructure anywhere in this app.
- `Plot` — display-only synopsis, same treatment as Plex's `summary`/Jellyfin's `Overview`
  (also on-demand per this session's retroactive fix).
- `BoxOffice` — numeric but not selected as a filter target this pass; candidate to graduate to a
  real field later if wanted.
- Raw `Awards` text — the derived booleans (`awardWinner`/`oscarWinner`) stay enrichment; the
  underlying free text stays discarded/on-demand only.
- `Poster`, `DVD`, `Production`, `Website` — low-value links/dates, no filter use case.

## Out of scope

- **Season/episode lookup mode** (`Season`/`Episode` params, `totalSeasons`) — per-episode
  granularity isn't modeled for any provider today, same exclusion as Sonarr's `EpisodeSearch`.
- **Search mode** (`s=`) — returns partial match lists, not full records; no use case identified for
  a lookup-only enricher.

## Tasks / automation options

None. OMDB is a read-only ratings/metadata lookup service; no `MediaActuator` role is plausible.

## Naming-collision notes (for the final precedence ticket)

- **`certification`** — OMDB's `Rated` joins the existing multi-producer field, makes the current
  stale `ruleRegistry.ts` listing (declared, never populated) accurate.

Rating-specific collision notes (`imdbRating` vs. TMDB's non-equivalent rating, the Metacritic
self-collision) moved to `docs/intent/media-ratings-provider.md` along with the fields themselves.

## Filter type mapping

Tasks: N/A — no tasks (spec's own "Tasks / automation options" section: "None. OMDB is a read-only
ratings/metadata lookup service; no `MediaActuator` role is plausible.").

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `certification` | `certification` | `csv-strings` | Joins the existing shared `certification` rule (`csv-strings`, already lists OMDB in `providers` in `ruleRegistry.ts`) as an additional producer. No new key — this wiring is exactly what makes that already-stale listing accurate, per the spec's own framing. |
| `genres` | `genres` | `csv-strings` | Joins the existing shared `genres` rule (movie and show variants, both already `csv-strings`) as an additional producer, per the spec's "Shared with Radarr, Sonarr, TMDB, Plex, Jellyfin" note. No new key. |
| `runtime` | `runtimeMinutes` | `range` | Joins the `runtimeMinutes` range rule minted by `specs/radarr.md` ("runtime under 90 min", same shape as `sizeOnDiskGb`) as an additional producer, per this spec's "Shared with Radarr, Plex, Jellyfin" note. No new key — OMDB does not mint its own runtime rule. |
| `originCountry` | `originCountry` | `csv-strings` | Joins the `originCountry` rule minted by `specs/tmdb.md` (ISO country codes, `csv-strings`, same shape as `genres`/`network`) as an additional producer — `specs/tmdb.md`'s own filter-mapping table already flags this exact OMDB/TMDB pairing as a future collision on the same field. No new key. |
| `awardWinner` | `awardWinner` | `boolean` | New rule — no other provider produces an award-derived signal; not a join. Same shape as `hasFile`/`watched`/`monitored`: a single true/false predicate, not a range or string set. |
| `oscarWinner` | `oscarWinner` | `boolean` | New rule, same reasoning as `awardWinner` — OMDB-only derived boolean, no existing rule to join. |
| `Director`, `Writer`, `Actors`, `Plot`, `BoxOffice`, raw `Awards` text, `Poster`, `DVD`, `Production`, `Website` | — none — | — | On-demand item-detail metadata per the spec's own "not enrichment" classification (flat person strings with no filter-by-person infrastructure, display-only synopsis, a link/date/text field with no filter use case). Never batch-enriched, never filtered on. No filter mapping. |

## UI decisions

No `/prototype` session needed — every filterable field maps onto a `RuleControl` renderer already
established across the seven prior UI passes (`csv-strings` → `MultiSelectFilter`, `range` →
`NumberRangeFilter`, `boolean` → `OptionFilter`). No tasks exist for OMDB ("Tasks: N/A — no tasks"
above), so nothing goes to `11-automation-task-parameters` this ticket, matching TMDB's UI pass.

### `certification` / `genres` / `runtime` / `originCountry` — confirmed as joining, no new key/route/widget

OMDB becomes an additional producer on all four already-shared rules (`csv-strings`, `csv-strings`,
`range`, `csv-strings` respectively) per the mapping table above. No control decision to make —
`RuleControl` already renders these for Radarr/Sonarr/TMDB/Plex/Jellyfin. `runtime` joins
`runtimeMinutes`, the `range` rule minted by `specs/radarr.md`; `originCountry` joins the
`csv-strings` rule minted by `specs/tmdb.md`, resolved there as a hardcoded ISO-3166-1 fixed-array
branch in `csvStringOptions` — no new `Lookups` route for either.

**Carry-forward from TMDB's UI ticket, confirmed**: OMDB's `Country` field is single-valued (per
OMDB's API shape), joining `originCountry` as an additional producer of that multi-value
`csv-strings` rule. This is a query-engine/provider-field-layer concern, not a widget-shape one — the
UI control is unaffected (`MultiSelectFilter` already handles a producer contributing a
single value into the aggregated set). The one-element-array wrapping needs to happen where OMDB's
`Country` value is normalized into the shared `originCountry` field, not in `MediaFilterBar`. No UI
change follows from this note; flagged here only so the wrapping isn't lost before that layer is
implemented.

### `awardWinner` / `oscarWinner` — confirmed `boolean`, both need `BOOLEAN_VALUE_LABELS` entries

Same shape as `hasTrailer`/`overseerrHasIssue` — generic "Yes"/"No" would read ambiguously in an
active-filter chip, and the two rules are independent signals (a title can be industry-award-winning
without having won an Oscar specifically, or vice versa in edge cases like nominations counted
differently), so they need distinct copy, not a shared pair. Add:

```
awardWinner: ['Award Winner', 'No Awards'],
oscarWinner: ['Oscar Winner', 'No Oscar'],
```

### On-demand metadata fields — confirmed excluded, no action

`Director`/`Writer`/`Actors`/`Plot`/`BoxOffice`/raw `Awards` text/`Poster`/`DVD`/`Production`/
`Website` stay out of the filter mapping per the spec's own "not enrichment" classification above —
no UI control to design, nothing reopened here.

### Summary of corrections to the "Filter type mapping" table above

None. Every row's `dataType` classification in the mapping table is confirmed as-is; this section
adds the two boolean label pairs and confirms the joined fields carry no widget-shape work.
