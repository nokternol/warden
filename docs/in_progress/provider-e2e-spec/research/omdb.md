# OMDb — field/task audit

Research asset for `docs/in_progress/provider-e2e-spec/tickets/08-omdb-research.md`. Enumeration
only — no build decisions made here (see ticket's parent map for the follow-on decision ticket).

## Source

Official docs: https://www.omdbapi.com/ (fetched 2026-07-19).

## Request surface (official API)

| Param | Meaning | Used by this codebase? |
|---|---|---|
| `i` | Lookup **by IMDb ID** (e.g. `tt1285016`) | **No** — not used anywhere |
| `t` | Lookup by title (string match) | Yes — the only lookup mode `OmdbProvider.getRatings` uses |
| `s` | Search (returns list of matches, not full record) | No |
| `type` | Filter: `movie`/`series`/`episode` | Yes — tried as `movie` first, falls back to `series` |
| `y` | Year of release | Yes — passed through when caller supplies `year` |
| `plot` | `short`/`full` plot detail | No |
| `r` | Response format (json/xml) | No (json implicit via client) |
| `Season`/`Episode` | Per-episode lookup for series | No |
| `page` | Pagination for `s=` search | No (search mode unused) |

**Key finding:** the codebase never uses `i=` (ID-based lookup), only `t=` (title-based, with a
`type=movie` → `type=series` fallback). OMDb's docs confirm `i=` is fully supported as an
alternative primary lookup key and is the documented reliable path when an IMDb ID is already
known.

**Relevant existing data:** `NormalizedMovie`/`NormalizedSeries`'s `_sourceIds` already carries an
`imdb` id (`server/modules/media/normalizeMedia.ts:14`, sourced from Radarr's `imdbId` field) even
though `OmdbProvider` doesn't currently consume it. If OMDB were to become a real enricher, ID-based
lookup (`i=<_sourceIds.imdb>`) is available today without any new schema — Radarr already surfaces
the IMDb id, it's just never handed to `OmdbProvider`.

## Response fields (official API) vs what `OmdbProvider.getRatings()` actually parses

| OMDb response field | Parsed by `parseRatings()` today? | Notes |
|---|---|---|
| `Title` | No | not returned in `OmdbRating` |
| `Year` | No | not returned |
| `Rated` (MPAA/content rating, e.g. "PG-13") | **No** | **this is OMDB's actual certification field** — see collision/gap note below |
| `Released` | No | |
| `Runtime` | No | |
| `Genre` | No | |
| `Director` | Yes | `result.director` |
| `Writer` | **No** | not captured at all |
| `Actors` | Yes | `result.actors` (comma-joined string, not structured list) |
| `Plot` | No | not requested (`plot` param unused) or captured |
| `Language` | Yes | `result.language` |
| `Country` | **No** | fetched in `OmdbResponse` type but never read in `parseRatings` |
| `Awards` (free-text string) | Yes, indirectly | regexed into `awardWinner`/`oscarWinner` booleans only — raw text discarded |
| `Poster` | No | not in `OmdbResponse` type at all |
| `Ratings[]` (multi-source: Internet Movie Database, Rotten Tomatoes, Metacritic) | Partially | RT % and Metacritic parsed out; the "Internet Movie Database" entry inside `Ratings[]` is ignored in favor of top-level `imdbRating` |
| `Metascore` | No | **not the same as `Ratings[].Metacritic`** — `OmdbResponse` doesn't even declare `Metascore`; current code derives metacritic score by parsing the `Ratings[]` array's Metacritic entry instead, so `Metascore` field itself is unused/redundant with what's already covered |
| `imdbRating` | Yes | `result.imdbRating` |
| `imdbVotes` | Yes | `result.imdbVotes` |
| `imdbID` | Yes | `result.imdbId` |
| `Type` | Used internally only | drives the movie→series fallback branch, not returned in `OmdbRating` |
| `DVD` | No | not in `OmdbResponse` type |
| `BoxOffice` | Yes | `result.boxOffice` (parsed to number) |
| `Production` | No | not in `OmdbResponse` type |
| `Website` | No | not in `OmdbResponse` type |
| `Response` | Yes | used for the movie/series fallback + not-found handling |
| `totalSeasons` (series-only, requires `Season`/`Episode` params) | No | season/episode lookup mode unused entirely |

## Wired into the media-item pipeline? (confirmed)

**No — same "inert" state as `docs/architecture/media-providers.md`'s OMDB section describes.**
Verified directly:

- `OmdbProvider` (`server/modules/providers/connections/omdbProvider.ts`) implements none of
  `MediaSource`, `MediaEnricher`, `MediaActuator` — it extends only `BaseProviderConnection` and
  exposes a single `getRatings()` method.
- Only two consumers exist, both outside the enrichment pipeline: `server/modules/providers/ratingsAggregation.ts`
  (merges TMDB/OMDB/TVMaze ratings, cross-checks `imdbId` agreement between TMDB and OMDB and logs a
  warning on mismatch — this cross-check function is itself evidence the codebase already
  distrusts OMDB's title-match reliability) and `server/modules/providers/providers.procedures.ts`'s
  `getRatings` route (ad hoc `/ratings` endpoint, constructs `OmdbProvider` inline, not through
  `ProviderFactory`'s registered instance).
- Not referenced anywhere in `server/modules/media/enrichment/enricherAdapters.ts` or
  `server/modules/media/mediaFieldProvider.ts` (no `omdbFieldProvider`/`omdbFieldSource` exists,
  unlike `plexFieldProvider`, `tmdbFieldSource`, etc.).
- `filterRegistry.ts` lists `MetadataProviderType.OMDB` as a `sourceProviders` entry on exactly one
  rule: `certification` (line ~212). It is **not** listed on `imdbRating` (line ~285) — that rule's
  `sourceProviders` is `[MetadataProviderType.RADARR]` only. **This corrects the ticket's "known
  context" framing**: only `certification` has the stale "listed but nothing populates it from
  OMDB" gap; `imdbRating` is populated (from Radarr's own `ratings.imdb.value`, not OMDB) and
  doesn't list OMDB as a source at all today. The ticket's premise that both fields have this gap is
  half right — flagging the correction here rather than silently fixing the ticket text.

## Gaps by layer (enumerated, not prioritized)

For each item: what layer it would touch if ever wired.

- **Provider field / connection layer**: `OmdbProvider` would need an `i=`-based lookup path
  (parallel to or replacing the current `t=` title-search) to become ID-reliable. Also unparsed
  fields available for the taking with no new API call: `Rated`, `Writer`, `Country`, `Genre`,
  `Runtime`, `Plot`, `Poster`, raw `Awards` text (currently discarded after regex).
- **Structural schema change**: `NormalizedMovie`/`NormalizedSeries` (`server/modules/media/movie.ts`,
  `series.ts`) has no column for Rotten Tomatoes %, Metacritic score, box office, director, actors,
  writer, or award flags — all would be *new fields*, not reuse of an existing `settings` JSON
  blob slot. Per the EAV persistence shape adopted in `media_enrichment` (per commit 855d514), these
  would likely land as new EAV field keys rather than wide-table columns, but that's a decision for
  the follow-on ticket, not asserted here.
- **UI filter / query engine**: none of OMDB's un-wired fields (RT%, Metacritic, box office,
  director/actors/writer, `Rated` certification) have any `filterRegistry.ts` rule today. Adding any
  of them means a new rule entry plus (per the recent Plex-added-date bug, commit 714fa4d) care
  around silent-drop behavior for items OMDB has no match for.
- **Enrichment**: would require a new `omdbFieldProvider`/`omdbEnricher` following the
  `MediaFieldProvider` visit→transform pattern in `server/modules/media/enrichment/enricherAdapters.ts`,
  keyed off `_sourceIds.imdb` (already present) rather than title — this is the natural fix for the
  reliability concern below.
- **Tasks/automation**: no `MediaActuator` role is plausible for OMDB (it's a read-only ratings
  lookup service, nothing to actuate). Not flagging any actuator gap.

## Central open question (flagged, not decided)

**Does OMDB need a real `MediaEnricher` role at all, given its lookup is title-based and prone to
mismatches?** This is a materially different risk profile from TMDB/TVMaze/Radarr-style ID-keyed
lookups:

- The existing `ratingsAggregation.ts` code already contains a defensive `imdbId` mismatch check
  between TMDB and OMDB results and logs a warning when they disagree — i.e., the codebase already
  encodes distrust of OMDB's title-match correctness for the ratings-aggregation feature.
- However, `_sourceIds.imdb` is already populated (from Radarr) for movies today, which means an
  ID-based OMDB lookup (`i=` param, confirmed supported) is available with **zero new schema** —
  this would eliminate the title-mismatch risk entirely for movies with a known IMDb id, and only
  the title-search fallback would remain for the (likely rare) case where `_sourceIds.imdb` is
  absent.
- Whether that's "wire it as an ID-keyed enricher" vs. "leave it as an on-demand ratings-lookup
  feature only" vs. "some hybrid" is exactly the kind of call this research ticket is not supposed
  to make. Flagging as the central decision for the follow-on ticket.

## "Listed but not wired" filterRegistry correction

- `certification` rule: lists OMDB as a `sourceProviders` entry but no enricher populates it from
  OMDB (OMDB's `Rated` field is never even parsed by `OmdbProvider` today — a double gap: not
  parsed *and* not wired). Decision ticket should choose: wire OMDB's `Rated` for real, or drop
  OMDB from this rule's `sourceProviders` list as a stale entry.
- `imdbRating` rule: **does not list OMDB** (contrary to how the ticket's "known context" framed
  it) — it's sourced from Radarr only. No correction needed here; noting for accuracy since the
  ticket text implied otherwise.

## Naming-collision risks (flagged, not resolved)

- **`imdbRating`**: `OmdbRating.imdbRating` (OMDB's own field) vs. `NormalizedMovie.imdbRating`
  (currently Radarr-sourced, itself originally sourced from RadK's/Radarr's bundled ratings, not
  OMDB) vs. TMDB's own vote-average style rating field (per `docs/architecture/media-providers.md`'s
  TMDB section, also unwired). Three distinct "a rating field called imdbRating/similar" sources
  that are not currently reconciled — precedence ticket territory.
- **`Rated`** (OMDB's MPAA-style content rating) vs. `certification` (the existing normalized field,
  currently Radarr/Sonarr-sourced) — same concept, different literal field name; a naive wiring
  would need to map OMDB's `Rated` onto `certification`, not introduce a parallel field.
- **Metacritic**: OMDB exposes it two ways — a `Ratings[]` array entry *and* (per official docs,
  not currently in this codebase's `OmdbResponse` type) a top-level `Metascore` field. If a future
  enricher parses both without realizing they're the same number, that's a self-collision risk
  worth flagging even though it's internal to OMDB rather than cross-provider.
- **`BoxOffice`**: no known collision with another provider in this codebase today, but flagging
  since box-office as a concept could plausibly be sourced from TMDB in the future too.

## Structural schema-change gaps (flagged, not designed)

- Every OMDB field beyond `imdbRating`/`imdbVotes`/`imdbId` (i.e. RT%, Metacritic, box office,
  director, actors, writer, country, genre, runtime, plot, poster, raw awards text, MPAA rating)
  has no existing column/EAV-key on `NormalizedMovie`/`NormalizedSeries` or the `media_enrichment`
  EAV store — any of these being wired for real is a structural addition, not a config change.

## Summary counts

- OMDb API response fields per official docs: **24** top-level fields (including `totalSeasons`
  for series lookups) plus the nested `Ratings[]` array (3 typical entries: IMDb, Rotten Tomatoes,
  Metacritic).
- Fields the codebase's `OmdbResponse` type even declares: 13 (`Title`, `Year`, `Type`, `imdbID`,
  `imdbRating`, `imdbVotes`, `Ratings`, `Response`, `Error`, `Awards`, `Director`, `Actors`,
  `Language`, `Country`, `BoxOffice` — 15 counting `Error`/`Type` as non-data fields).
- Fields actually surfaced in `OmdbRating` (the parsed output): 10 (`imdbId`, `imdbRating`,
  `imdbVotes`, `rottenTomatoesRating`, `metacriticRating`, `found`, `awardWinner`, `oscarWinner`,
  `director`, `actors`, `language`, `boxOffice` — 12 including `found`/`source`).
- Fields wired into the media-item pipeline (enrichment/filter/query engine): **0**.
- Newly-flagged not-yet-wired fields/tasks (this document's enumeration beyond the ticket's known
  context): **~14** — `Rated`/certification gap, `Writer`, `Country` (typed but unread), `Genre`,
  `Runtime`, `Plot`, `Poster`, `DVD`, `Production`, `Website`, raw `Awards` text, ID-based lookup
  (`i=` param) as an alternative to title search, season/episode lookup mode, and the
  `imdbRating`-does-not-actually-list-OMDB filterRegistry correction.
