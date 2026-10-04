---
type: wayfinder-spec
label: wayfinder:spec
provider: tvmaze
status: draft
source_ticket: docs/in_progress/provider-e2e-spec/tickets/10-tvmaze-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/tvmaze.md
---

# TVMaze — E2E spec

## Correction to research: TVMaze requires an API key

The research doc's "keyless, single fixed public URL, no config needed" conclusion reflects this
codebase's current stub (`ProviderFactory.createTvMaze()` hardcodes `apiKey: null`), **not reality**.
TVMaze genuinely requires an API key — the user had one configured previously; it was lost in a
database reset, and re-acquiring it is currently blocked by a broken social-login flow on TVMaze's
site. This flips several of the research doc's tentative conclusions:

- TVMaze gets a **real `metadata_provider` row** (`settings.apiKey`), not a hardcoded no-config
  construction.
- TVMaze's entry in the server's provider-type catalogue
  (`server/modules/providers/providerCatalogue.ts`) has the same full shape as other API-key
  providers (`apiPath`/`defaultUrl`), not a stripped-down keyless variant, and `TVMAZE` is removed
  from the deferred provider types in `contract/scope.ts` so it is offered.
- `TvMazeProvider` is **folded into the standard `ProviderFactory` contract** — added to
  `AnyProvider`, `ProviderSet`, and `create()`'s switch, replacing the bespoke `createTvMaze()`
  method that currently sits outside it. Enrichment gets included via the same active-provider-row
  check (`findActiveByTypes`) every other enricher uses — not unconditionally always-on, since it is
  currently *unconfigured* (no key) and should correctly show as inactive until re-configured.
- **No placeholder/fake configuration is inserted as part of this spec or its implementation** — the
  row/registry entry exist so the provider works once a real key is available; the user configures
  it through the normal Settings UI when they have one again.
- **Process-hygiene fix, same session**: `providers.procedures.ts`'s duplicate inline `TvMazeProvider`
  construction (bypassing `ProviderFactory.createTvMaze()`) is superseded by folding into the
  standard contract above — there's no longer a bespoke method to bypass.

## Headline field gap: `network`, merged with `webChannel`

`ruleRegistry.ts`'s `network` rule already lists TVMaze in `providers` alongside Sonarr;
`NormalizedSeries.network` already exists as a field; `TvMazeProvider.getShow()` genuinely returns
per-show network data. The only missing piece is the enricher. **Must read both `network` and
`webChannel`** — streaming-exclusive shows (Netflix/Hulu/etc. originals) populate `webChannel`
instead of `network`; a naive `network`-only read would silently show these titles as network-less.
TVMaze becomes a second producer of the existing `network` field (Sonarr already owns it);
precedence order flagged for the final ticket.

## New fields to wire — shared (TVMaze becomes an additional producer)

| Domain field | Source | Shared with |
|---|---|---|
| `network` | `network` merged with `webChannel` | Sonarr |
| `genres` | `genres` (typed, unused) | Sonarr, TMDB, Plex, Jellyfin |
| `status` | `status` (`Ended`/`Running`/`To Be Determined`), **mapped** onto the existing vocabulary (`ended`/`continuing`/`upcoming`) — same concept as `NormalizedSeries.status`, just different words, unlike `type` below | Sonarr |
| `releaseDate` | `premiered` (currently used only for search-disambiguation, not persisted) | Plex's `originallyAvailableAt`, Jellyfin's `PremiereDate` |
| `runtime` | `averageRuntime` (not the more volatile per-episode `runtime`) | Radarr, Plex, Jellyfin — **first show-level producer**, closing the movies-only gap those three left open |

## New fields to wire — kept separate (not mapped/merged)

| Domain field | Source | Why not merged |
|---|---|---|
| `tvmazeType` | `type` (Scripted/Animation/Reality/Talk Show/...) | Genuinely different concept from `seriesType` (standard/daily/anime) — TVMaze's `type` is a content-format/genre-adjacent classification, `seriesType` describes release cadence. Not the same axis, so not mapped even lossily. |
| `tvmazeEndedAt` | `ended` (date string, finale air date) | Different shape from `NormalizedSeries.ended` (boolean, Sonarr-sourced) — same underlying concept, incompatible types, kept separate rather than force-converted. |
| `weight` | `weight` (TVMaze's internal popularity score) | No existing analog anywhere — new filterable "popularity" concept. |
| `language` | `language` (single string, typed but unused) | Distinct shape from TMDB's `spokenLanguages` (array) — kept as its own field, not merged. |

## Identity crosswalk (not enrichment)

- `externals.tvrage` — same treatment as the already-wired `externals.thetvdb`/`externals.imdb`.
- `/lookup/shows?imdb=`/`?tvrage=` — wire these lookup modes alongside the already-wired `thetvdb=`,
  same class of gap as OMDB's previously-unused `i=` mode (now fixed in `specs/omdb.md`).

## Ratings — extracted to a dedicated intent doc

`rating.average` stays exactly as it is today: consumed only by `ratingsAggregation.ts`'s blended
average alongside TMDB/OMDB, **not** added to `ruleRegistry`/`EnrichmentFields`. Full reasoning,
the per-provider ratings inventory (now consolidated across every provider's spec, not just
TVMaze's), and the proposed `MediaRatingsProvider` role live in
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) — written as a
follow-up to this ticket, since TVMaze is the provider whose research surfaced the need for a
dedicated architectural pass, not because TVMaze is uniquely responsible for the gap.

**Implementation requirement, not optional**: `TvMazeProvider`'s rating read site must carry a JSDoc
comment pointing at that intent doc. `docs/in_progress/` gets deleted once this phase ships (per this
repo's docs convention) — a comment only in a spec file is not durable; the code itself must carry
the note so the intent survives the doc's deletion. Same requirement applies to TMDB's/OMDB's rating
read sites.

## Out of scope (structural, flagged not designed)

- **Episodes** (`/shows/:id/episodes`, `/episodebynumber`) — no episode-level table/EAV concept
  exists anywhere in this codebase for any provider.
- **Cast/crew** (`/shows/:id/cast`, `/crew`) — no person/credit concept exists in
  `NormalizedSeries`/`NormalizedMovie`, same structural class as TMDB's deferred `credits`.
- **Akas/alternate titles** (`/shows/:id/akas`) — no alternate-title concept exists anywhere.
- **Schedule** (`{ time, days[] }`) — no broadcast-schedule concept exists.
- **Seasons endpoint** (`/shows/:id/seasons`) — season-level `network`/`webChannel` can differ from
  the show-level ones (a show can change networks between seasons); a second-order precedence
  question beyond the show-level `network` field, not designed here.
- **Images/artwork** (`/shows/:id/images`, `image.medium`/`image.original`) — no poster/image field
  exists on `NormalizedSeries`/`NormalizedMovie` for any provider today.

## On-demand item-detail metadata (not enrichment)

Same principle as `specs/tmdb.md`/`specs/omdb.md`: `url`, `officialSite`, `dvdCountry`, `updated`,
`summary` (HTML synopsis), `image` — none of these would ever be filtered on. JSDoc-noted on
`tvmazeProvider.ts` as candidates for a future "full item detail" capability, not wired as
`EnrichmentFields`.

## Tasks / automation options

None. Confirmed empty-by-design in research: `TvMazeProvider` implements no `tasks()`, and none is
plausible — a read-only public metadata API with no request/download/library-management concept.

## Naming-collision notes (for the final precedence ticket)

- **`network`** — TVMaze and Sonarr both feed this field; string-casing/naming differences between
  the two sources (e.g. TVMaze's `network.name` vs. Sonarr's own network string) could silently
  overwrite depending on enrichment ordering. Precedence order not decided here.
- **`genres`** — TVMaze becomes a third producer alongside Sonarr/TMDB; precedence among all three
  not decided here (already an open question even before TVMaze).
- **`status`** — mapped onto the existing vocabulary rather than kept separate; the mapping itself
  (`Ended`→`ended`, `Running`→`continuing`, `To Be Determined`→`upcoming`) should be documented at
  the implementation site, not just asserted here.
- **`runtime`** — TVMaze's `averageRuntime` (shows) joins Radarr's `runtime` (movies) and
  Plex/Jellyfin's (both content types) — first genuine show-level producer, worth the precedence
  ticket confirming the shared field's semantics hold across content types cleanly.

## Filter type mapping

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `network` | `network` | `csv-strings` | Joins the existing show-only `network` rule in `ruleRegistry.ts` — TVMaze already listed alongside Sonarr in `providers`; no new rule needed. |
| `genres` | `genres` | `csv-strings` | Joins the existing show-only `genres` rule — TVMaze becomes a third producer alongside Sonarr/TMDB; no new rule needed. |
| `status` | `seriesStatus` | `string` | Mapped onto the existing vocabulary (`Ended`→`ended`, `Running`→`continuing`, `To Be Determined`→`upcoming`) and joins the existing `seriesStatus` rule — TVMaze becomes an additional producer; no new rule needed. |
| `releaseDate` | `releaseDaysAgo` | `range` | **Reconciled**: joins the same `releaseDaysAgo` rule Plex/Jellyfin independently minted for their own `releaseDate` fields (see `specs/plex.md`/`specs/jellyfin.md`) — release date is a general concept, not content-type-specific, so this is a third producer rather than a separate show-only rule. `premiered` is a past date, fits the "days ago" convention. |
| `runtime` | `runtimeMinutes` | `range` | **Reconciled key name** — Radarr's/Plex's/Jellyfin's/OMDB's independently-made mappings converged on `runtimeMinutes`. **Flagged for the precedence ticket** (same flag as `specs/plex.md`): whether this should be the *same* rule as the movie-side `runtimeMinutes` (`contentTypes: ['movie','series']`, like `year`/`title`) now that TVMaze is the first show-level producer, rather than two separately-scoped rules — not resolved here. |
| `tvmazeType` | `tvmazeType` | `string` | Free-form provider classification (Scripted/Animation/Reality/Talk Show/...), no closed enum enforced client-side. Kept separate per spec — not the same axis as `seriesType`, so it needs its own rule rather than joining it. |
| `tvmazeEndedAt` | `tvmazeEndedDaysAgo` | `range` | Finale air date is a past date, so "days ago" fits the same convention as `releaseDate` above. Kept separate from the boolean `ended` rule per spec (incompatible shapes) — new rule. |
| `weight` | new — `weight` | `range` | Numeric popularity score, no existing analog to join — new rule. |
| `language` | new — `language` | `string` | Single string value, filtered by exact/equality match like `seriesType`/`seriesStatus`. Distinct shape from TMDB's array-valued `spokenLanguages`, so not a `csv-strings` join — new rule. |

Not mapped:
- `rating.average` — deferred to `docs/intent/media-ratings-provider.md`, correctly excluded here.
- `externals.tvrage`, `/lookup/shows?imdb=`/`?tvrage=` — identity crosswalk, never independently filtered on.
- `url`, `officialSite`, `dvdCountry`, `updated`, `summary`, `image` — on-demand item-detail metadata, never filtered on.

Tasks / automation options: N/A — no tasks, confirmed empty-by-design.

## UI decisions

No `/prototype` session needed — every filterable field maps onto a `RuleControl` renderer already
established across the eight prior UI passes (`range` → `NumberRangeFilter`, `csv-strings` →
`StringMultiSelectDropdown`, `string` → `ENUM_OPTIONS`-driven fixed picker). No tasks exist for
TVMaze (confirmed: "Tasks / automation options: N/A" above), so nothing goes to
`11-automation-task-parameters` — the ninth of ten providers with nothing to append there.

### `network` / `genres` / `status` (`seriesStatus`) / `releaseDate` (`releaseDaysAgo`) / `runtime` (`runtimeMinutes`) — confirmed as joining, no new key/route/widget

All five join existing shared rules as additional producers (`network`/`genres` are `csv-strings`
already resolved through `lookups.networks`/`lookups.genres.series`; `seriesStatus` is the existing
`ENUM_OPTIONS` string picker; `releaseDaysAgo`/`runtimeMinutes` are the existing `NumberRangeFilter`
ranges). No control decision to make — `RuleControl` already renders these; TVMaze just adds to
`providers`. `runtimeMinutes`'s movie/show-rule-unification question stays flagged for
`99-precedence`, not decided here (per the spec's own "Naming-collision notes").

### `tvmazeType` — closed enum confirmed; new `ENUM_OPTIONS` entry (not the third free-text-gap occurrence)

The filter-mapping table's "no closed enum enforced client-side" phrasing was flagged as a warning
sign matching Radarr's `folderName`/`path` and Sonarr's `path` — both genuinely free-text fields
left display-only. Checked TVMaze's actual API/editorial documentation rather than only the
codebase's `TvMazeShow` type (which declares `type: string` with no enum, the same shape that made
the research doc describe it as "no closed enum").

TVMaze's own FAQ (`tvmaze.com/faq/13/shows`, "Shows" — the page governing how editors classify a
show) states `type` is "an objective and categorical definition of the show's type" and enumerates
the permitted values: Scripted, Animation, Reality, Talk Show, Documentary, Game Show, News, Sports,
Variety, Award Show, Panel Show. This is not server-schema-enforced (the API's `TvMazeShow.type` is
typed as a bare `string`), but it **is** editorially closed — TVMaze's own crowdsourced-editing
policy constrains every show in their database to one of these eleven values, the same kind of
closed-by-convention vocabulary `overseerrIssueType` and `tmdbStatus` already established a
precedent for (API type declared as loose `string`, real-world value set bounded and known). This is
**not** the third occurrence of the free-text gap — it's a closed enum that happened to be
underspecified by the TypeScript type, not a substring/path-match field like Radarr's/Sonarr's.

**Decision**: new `ENUM_OPTIONS.tvmazeType` entry, one `{ value, label }` pair per documented type
(value = the exact API string, label = same text — no abbreviation needed):

```
tvmazeType: [
  { value: 'Scripted', label: 'Scripted' },
  { value: 'Animation', label: 'Animation' },
  { value: 'Reality', label: 'Reality' },
  { value: 'Talk Show', label: 'Talk Show' },
  { value: 'Documentary', label: 'Documentary' },
  { value: 'Game Show', label: 'Game Show' },
  { value: 'News', label: 'News' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Variety', label: 'Variety' },
  { value: 'Award Show', label: 'Award Show' },
  { value: 'Panel Show', label: 'Panel Show' },
]
```

Chose `ENUM_OPTIONS` (single-value fixed picker) over a `csv-strings` hardcoded-array branch because
the filter-mapping table already fixed `dataType: string` (single-value equality match, matching
`seriesType`/`seriesStatus`'s shape) — not a multi-select concept like `originCountry`/
`spokenLanguages`. No `SEGMENT_LABEL_OVERRIDES` entry needed; the registry label ("TVMaze type" or
similar) doesn't collide with a nearby heading the way `tmdbStatus` did.

This keeps the free-text-gap count at two (Radarr's `folderName`/`path`, Sonarr's `path`). TVMaze is
the last per-provider UI ticket *this session's queue assigned to `claude`*, but `09-seerr-ui`
remains open/unclaimed, so it's still possible (if unlikely, given Seerr shares Overseerr's
implementation and field set) for a third occurrence to surface there before the map's per-provider
UI tickets are all genuinely closed.

### `tvmazeEndedAt` (`tvmazeEndedDaysAgo`) — confirmed `range`, no new widget

Finale air date, past date, same "days ago" convention as `releaseDaysAgo` — `NumberRangeFilter`
already renders this shape. New rule (per the spec's mapping table), but no new control.

### `weight` — confirmed `range`, no new widget

Numeric popularity score, no lookup needed (unlike `csv-ids`/`csv-strings` fields) — plain
`NumberRangeFilter`, same treatment as Radarr's `movieFileCount`/Sonarr's `seasonCount` once those
were reclassified to `range`. New rule, no new control.

### `language` — closed enum confirmed; new `ENUM_OPTIONS` entry, seeded from a common subset (not the full ISO 639-1 set)

TVMaze's FAQ (`tvmaze.com/faq/13/shows`) states: "Only languages that exist in the ISO 639-1 standard
are available on TVmaze" (with unavailable languages folded into their nearest ISO 639-1 variant) —
a genuinely closed, externally-standardized vocabulary, the same class TMDB's `originCountry`/
`spokenLanguages` resolved as (b): hardcoded fixed-array, not a `Lookups` route. But `language` here
is `dataType: string` (single-value equality, like `seriesStatus`), not `csv-strings`
(multi-value) — so the mechanism is `ENUM_OPTIONS`, not a `csvStringOptions` branch, mirroring
`tvmazeType` above rather than TMDB's array-valued fields.

ISO 639-1 itself is ~184 codes — larger than `tvmazeType`'s 11 but the same closed-vocabulary
justification TMDB's `originCountry` used at ~250 codes (size doesn't change the shape). Rather than
hand-transcribing the full ISO 639-1 table into this spec, **decision**: seed `ENUM_OPTIONS.language`
from the common subset of languages TVMaze's own library realistically surfaces (English, Japanese,
Spanish, French, German, Korean, Italian, Portuguese, Mandarin, Chinese, Dutch, Swedish, Norwegian,
Danish, Russian — full working set to be finalized at implementation time against a real ISO 639-1
language-name table, e.g. reusing whatever source TMDB's UI pass sourced its ISO 639-1
`spokenLanguages` codes from), matching the "start from a reasonable common set and grow" framing
this ticket was scoped with. Unlike `tvmazeType`'s complete 11-value enumeration (small enough to
transcribe in full), `language`'s full list is an implementation-time data-sourcing task, not a
UI-shape decision — the widget choice (`ENUM_OPTIONS`, single-select) is what's decided here, not
the exhaustive value list.

**Naming note**: TVMaze's `language` (single string, e.g. `"English"`) has no shape collision with
TMDB's `spokenLanguages` (array) — per the spec's own "kept separate" framing, these are two
independent rules (`language` vs. `spokenLanguages`), not merged, so no precedence question to flag
for `99-precedence`.

### Summary — free-text-gap count stays at two

Both `tvmazeType` and `language` resolved as closed enums (`ENUM_OPTIONS`), not free-text gaps. The
free-text-gap count (Radarr's `folderName`/`path`, Sonarr's `path`) is unchanged by this ticket. No
shared free-text control was built here. One per-provider UI ticket remains open in the map
(`09-seerr-ui`, unclaimed) — if a future field there or elsewhere hits the gap, it needs its own
ticket to decide whether two-going-on-three finally justifies the shared control.
