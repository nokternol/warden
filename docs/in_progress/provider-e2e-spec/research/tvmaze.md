# TVmaze — field/task audit

Research asset for `docs/in_progress/provider-e2e-spec/tickets/10-tvmaze-research.md`. Enumeration
only — no build decisions made here (see ticket's parent map for the follow-on decision ticket).

## Source

Official docs: https://www.tvmaze.com/api (fetched 2026-07-19). Docs page is functional/prose,
not schema-first, so field shapes below were cross-checked against live responses from the public
API itself (`https://api.tvmaze.com/shows/1`, `/shows/1/episodes`, `/shows/1/cast`, `/shows/1/crew`,
`/shows/1/akas`, `/shows/1/seasons`, `/shows/1/images`) — keyless, no auth needed, safe to hit
directly. Rate limit per docs: ~20 calls/10s per IP; responses cacheable up to 60 min.

## Highest-confidence finding: the `network` filter is wired to a rule but has no enricher

`server/modules/media/filterRegistry.ts`'s `network` rule (~line 370) already lists
`MetadataProviderType.TVMAZE` in `sourceProviders` alongside `SONARR`:

```ts
{
  key: 'network',
  label: 'Network',
  contentTypes: ['series'],
  dataType: 'csv-strings',
  sourceProviders: [MetadataProviderType.SONARR, MetadataProviderType.TVMAZE],
  ...
  predicate: (item, value) => {
    const show = item as NormalizedSeries;
    if (!show.network) return false;
    return parseCsvStrings(value).includes(show.network);
  },
},
```

`NormalizedSeries.network?: string` (`server/modules/media/series.ts:29`) already exists as a field —
this is not a schema gap, just a missing writer. `TvMazeProvider.getShow()`
(`server/modules/providers/connections/tvmazeProvider.ts:47`) genuinely returns per-show network
data today:

```ts
network: {
  name: string;
  country: { name: string };
} | null;
```

confirmed live (`GET /shows/1`): `"network": { "id": 2, "name": "CBS", "country": { "name": "United
States", "code": "US", "timezone": "America/New_York" }, "officialSite": "https://www.cbs.com/" }`.

**But there is no enricher.** `server/modules/media/enrichment/enricherAdapters.ts` defines
`plexEnricher`, `overseerrEnricher`, `tmdbEnricher`, `tautulliEnricher` — no `tvmazeEnricher`.
`server/modules/media/enrichmentJobFactory.ts`'s `create()` only requests
`TAUTULLI/OVERSEERR/PLEX/TMDB` provider types via `findActiveByTypes` and only builds those four
enrichers. TVMaze is absent from both the provider-fetch list and the enricher list — it cannot
reach `EnrichmentJob` at all today. This is a fully specified, immediately buildable gap: the
target field exists, the source data is confirmed live, only the enricher function + factory
registration + a way to resolve `_sourceIds.tvmaze` (or a TVDB→TVMaze lookup, see below) are
missing.

**Naming collision, not yet resolved:** `network` is already a `sourceProviders` entry for Sonarr
too, and the rule's predicate does a plain string match against a single `NormalizedSeries.network`
slot. If a TVMaze enricher and Sonarr both populate `network` for the same show with differing
strings/casing (e.g. Sonarr's network name vs. TVMaze's `network.name` — TVMaze also has a
separate `webChannel` object for streaming-only shows, see below), one will silently overwrite the
other depending on enrichment ordering — precedence ticket territory, flagged not resolved here.

## Wired into the codebase today (confirmed by direct reads)

- **Ratings aggregation** (`server/modules/providers/ratingsAggregation.ts`): fully wired.
  `TvMazeRating` (`source`, `tvMazeId`, `tvdbId`, `imdbId`, `rating`, `found`) is a first-class
  input to `aggregateRatings()` alongside TMDB/OMDB — included in `summary.totalSources`,
  `summary.foundSources`, and the averaged rating. `TvMazeProvider.getRatings(title, year)`
  (`tvmazeProvider.ts:63`) does a title search (`/search/shows?q=`), best-effort year-disambiguates
  when multiple results share a title, and reads `rating.average` plus `externals.thetvdb` /
  `externals.imdb` from the best match. Two call sites: `identityJobFactory.ts` is not one of
  them — ratings are consumed by `providers.procedures.ts`'s ad hoc `/ratings` route (line ~150),
  which additionally constructs a *second*, separate `TvMazeProvider` instance inline
  (`providers.procedures.ts:193-194`, bypassing `ProviderFactory.createTvMaze()` — a duplicated
  construction path worth flagging even though behaviorally equivalent today).
- **Identity resolution / TVDB crosswalk** (`server/modules/providers/identityJobFactory.ts:54`):
  `tvMazeLookup: this.providerFactory.createTvMaze(log)` is passed into `IdentityResolutionJob`,
  which uses `TvMazeProvider.lookupByTvdbId(tvdbId)` (`tvmazeProvider.ts:52`, hits
  `/lookup/shows?thetvdb=`) to resolve a TVMaze show id from a Sonarr/TVDB id. `NormalizedSeries`
  already carries `_sourceIds.tvmaze?: number` (`series.ts:13`) as a target slot for this — confirmed
  wired, not a gap.
- **`ProviderFactory.createTvMaze()`** (`providerFactory.ts:94-100`): bespoke factory method,
  separate from the `create()`/`createMany()`/`createInstances()` paths every other provider type
  goes through. `TvMazeProvider` is not in the `AnyProvider` union, not in `ProviderSet`, and not a
  case in `create()`'s switch — it is entirely outside the standard provider-construction contract.
  Hardcodes `https://api.tvmaze.com`, `apiKey: null`.

## Not wired / DB-config surface

- **No `metadata_provider` row.** `MetadataProviderType.TVMAZE = 'TVMAZE'` is a valid schema enum
  value (`server/database/schema.ts:23`) but no settings row is ever created or read for it — both
  construction sites (`createTvMaze()` and the inline construction in `providers.procedures.ts`)
  hardcode the URL and `apiKey: null` rather than reading from `metadata_providers`. Given TVMaze is
  keyless and has one fixed public base URL, **this may be intentionally a "no DB config needed"
  provider** rather than a gap — note explicitly rather than leaving blank, per ticket instructions.
  The only thing a settings row would buy is: (a) a `PROVIDER_REGISTRY` entry to make it visible/
  toggleable in Settings UI, (b) `enabledTasks`/instance-scoping infrastructure if TVMaze ever grew
  a `MediaActuator` role (see Tasks/automation below — currently N/A), (c) a `urlBase` override for
  self-hosted TVMaze-compatible mirrors (none exist; TVMaze itself is a single public service, so
  this is speculative).
- **`PROVIDER_REGISTRY`** (`src/lib/provider-registry.ts`): no `TVMAZE` entry, unlike all 8 other
  entries present (`PLEX`, `JELLYFIN`, `RADARR`, `SONARR`, `TAUTULLI`, `OVERSEERR`, `TMDB`, `OMDB`).
  Flagging per ticket's known context: **does TVMaze need a registry entry?** Two considerations
  cut against each other: (1) it's keyless and needs no user-supplied URL/API key, so there's
  nothing to "configure" in the traditional sense the registry models (`defaultUrl`,
  `apiSuffix`); (2) but `filterCapabilities` is also part of `ProviderEntry`, and TVMaze already has
  a real filter capability (`network`, once wired) that currently has no UI-surfaced way to say
  "this filter's data comes from TVMaze" the way OMDB/TMDB's entries advertise `['Ratings',
  'Metadata']`. Whether that argues for a registry entry with `defaultUrl: undefined`/no apiSuffix,
  or a different UI affordance entirely for keyless always-on providers, is a follow-on-ticket call.

## Full show resource (`GET /shows/:id`) — every field, wired status

Confirmed via live fetch of `https://api.tvmaze.com/shows/1`:

| Field | Wired in this codebase? | Notes |
|---|---|---|
| `id` | Yes | `TvMazeShow.id`, used as `tvMazeId` in ratings + `_sourceIds.tvmaze` |
| `url` | No | web page link, not fetched into `TvMazeShow` type at all |
| `name` | Yes (search/match only) | used to identify best match in `getRatings()`/`lookupByTvdbId`, not persisted as a title override |
| `type` (Scripted/Animation/Reality/...) | **No** | not in `TvMazeShow` type; no `NormalizedSeries` equivalent field exists today — closest is `seriesType` (`standard`/`daily`/`anime`, Sonarr-sourced, different vocabulary) — **naming/semantic collision risk**: TVMaze's `type` and `NormalizedSeries.seriesType` are conceptually adjacent but not the same enum, would need explicit mapping, not blind aliasing |
| `language` | Yes, typed | `TvMazeShow.language` exists on the type but not read/used by `getRatings()`; not in `NormalizedSeries` |
| `genres` | Yes, typed | `TvMazeShow.genres` exists on the type but unused; `NormalizedSeries.genres?: string[]` already exists (Sonarr/TMDB-sourced today per `filterRegistry.ts`'s `genres` rule) — wiring TVMaze here is additive to an existing multi-source field, not a schema change, but is a second **collision candidate** (genre taxonomies differ across providers) |
| `status` (Ended/Running/To Be Determined) | Partially | `TvMazeShow.status` typed but unused; `NormalizedSeries.status?: 'continuing'\|'ended'\|'upcoming'` already exists (Sonarr-sourced) — different string vocabulary than TVMaze's (`Ended`/`Running`/`To Be Determined`), would need mapping — **collision risk** |
| `runtime` | **No** | not in `TvMazeShow` type at all; no direct `NormalizedSeries` equivalent (Sonarr likely owns runtime today, unverified in this audit — flagging as unconfirmed rather than asserting) |
| `averageRuntime` | **No** | not in `TvMazeShow` type; distinct from `runtime` (average across episodes when runtime varies) |
| `premiered` | Yes | `TvMazeShow` has no explicit `premiered` field in the current type — wait, it does (`premiered: string`) — used only inside `getRatings()`'s year-disambiguation logic (`new Date(premiered).getFullYear()`), not persisted to `NormalizedSeries` |
| `ended` | **No** | live API returns this (date string) but `TvMazeShow` type doesn't declare it; `NormalizedSeries.ended?: boolean` exists but is Sonarr-sourced and a different shape (boolean vs. date) |
| `officialSite` | **No** | not in `TvMazeShow` type |
| `schedule` (`{ time, days[] }`) | **No** | not in `TvMazeShow` type; no `NormalizedSeries` equivalent — **structural schema gap** if ever wanted (no existing field shape to reuse) |
| `rating.average` | Yes | `TvMazeShow.rating.average`, consumed by `getRatings()` into `TvMazeRating.rating` — this is the one rating field fully wired end-to-end |
| `weight` (TVmaze's internal popularity score) | **No** | not in `TvMazeShow` type, no codebase equivalent concept |
| `network` (`{ id, name, country: { name, code, timezone }, officialSite }`) | Partially — see highest-confidence finding above | `TvMazeShow.network` typed (subset: only `name`/`country.name`, not `id`/`country.code`/`country.timezone`/`officialSite`), read by nothing yet — the confirmed enricher gap |
| `webChannel` (same shape as `network`, populated instead of `network` for streaming-only shows) | **No** | not in `TvMazeShow` type at all, not referenced anywhere in codebase (`grep` confirms zero hits). **This is a real gap in the `network` enricher plan**: a naive `tvmazeEnricher` reading only `show.network` would silently return nothing for every streaming-exclusive show (Netflix/Hulu/etc. originals use `webChannel`, not `network`) — needs to check both and merge, not just wire `network` alone |
| `dvdCountry` | **No** | not in type, no codebase equivalent |
| `externals.tvrage` | Yes, typed | `TvMazeShow.externals.tvrage`, not currently read anywhere (`getRatings()` reads `thetvdb`/`imdb` only) |
| `externals.thetvdb` | Yes | read into `TvMazeRating.tvdbId`, and separately via the dedicated `lookup/shows?thetvdb=` endpoint for identity resolution |
| `externals.imdb` | Yes | read into `TvMazeRating.imdbId` |
| `image.medium`/`image.original` | **No** | not in `TvMazeShow` type; no `NormalizedSeries` image/poster field exists at all today (unconfirmed whether any other provider owns show artwork — out of scope for this audit) |
| `summary` (HTML-formatted synopsis) | **No** | not in type, no codebase equivalent |
| `updated` (unix timestamp) | **No** | not in type |
| `_links` (HATEOAS self/previousepisode/nextepisode) | **No** | not in type, not needed given this codebase makes direct id-based calls |

## Other endpoints — none wired, none called anywhere in this codebase

Confirmed via live fetch against show id 1 (`Under the Dome`) for shape; confirmed via `grep` that
none of these paths appear anywhere under `server/`:

| Endpoint | Returns | Wired? |
|---|---|---|
| `GET /shows/:id/episodes` | Array of episode objects: `id, url, name, season, number, type, airdate, airtime, airstamp, runtime, rating.average, image, summary, _links`. Excludes specials by default (`?specials=1` includes them, unconfirmed if ever needed). | **No** — no episode-list concept exists for TVMaze anywhere in this codebase |
| `GET /shows/:id/episodebynumber?season=&number=` | Single episode, same shape as above. | **No** |
| `GET /shows/:id/cast` | Array of `{ person: { id, url, name, country, birthday, deathday, gender, image, updated, _links }, character: { id, url, name, image, _links }, self, voice }`. | **No** — no cast/crew concept exists anywhere in `NormalizedSeries`/`NormalizedMovie` for any provider, not just TVMaze; if ever wanted this is a **structural schema gap**, not an existing-field extension |
| `GET /shows/:id/crew` | Array of `{ type (e.g. "Creator"), person: {...same shape as cast's person...} }`. | **No** — same structural gap as cast |
| `GET /shows/:id/akas` | Array of `{ name, country: { name, code, timezone } }` — alternate/regional titles. | **No** — no akas/alternate-title concept anywhere in this codebase for any provider; **structural schema gap** if wanted |
| `GET /shows/:id/seasons` | Array of `{ id, url, number, name, episodeOrder, premiereDate, endDate, network, webChannel, image, summary, _links }` — note: season-level `network`/`webChannel` can differ from the show-level ones (a show can change networks between seasons) — **second-order collision/precedence question** beyond the top-level `network` field flagged above, if season-level granularity is ever wanted | **No** |
| `GET /shows/:id/images` | Array of `{ id, type (poster/banner/background/typography), main, resolutions: { original: {url,width,height}, medium: {...} } }` | **No** |
| `GET /search/shows?q=` | Array of `{ score, show: {...full show object...} }` — fuzzy search, typo-tolerant. | **Yes** — `TvMazeProvider.search()` (`tvmazeProvider.ts:40`), used internally by `getRatings()` for title-based lookup only; the full show payload each result carries is discarded down to `rating`/`externals`/`id` |
| `GET /singlesearch/shows?q=` | Single best match, supports `&embed=` for episodes/cast in one call. | **No** — not used; codebase's `search()` uses the multi-result `/search/shows` instead |
| `GET /lookup/shows?thetvdb=\|imdb=\|tvrage=` | Direct id-based lookup, single show. | Partially — only `thetvdb=` variant is wired (`lookupByTvdbId`, `tvmazeProvider.ts:51-61`); `imdb=` and `tvrage=` lookup modes are **not used**, despite `_sourceIds` structurally being able to carry an imdb id already (via other providers) — a same-shape gap to OMDB's unused `i=` lookup mode (see `research/omdb.md`) |
| `?embed=` query param (available on show/search/lookup endpoints, pulls in episodes/cast/etc. in one round-trip) | **No** | not used anywhere; every related-resource fetch in this codebase (if any were added) would currently require a separate call |

## Tasks / automation — genuinely empty, not a gap

TVMaze has no `MediaActuator` implementation and none is plausible: `TvMazeProvider` extends only
`BaseProviderConnection`, implements no `tasks()` method, and `isMediaActuator()`
(`server/modules/providers/roles.ts:80`) would return `false` for it. TVMaze is a read-only public
metadata API with no request/download/library-management concept — there is nothing to actuate.
Noting this explicitly as empty-by-design rather than an unflagged gap, per ticket instructions.

## Naming-collision risks (flagged, not resolved)

- **`network`**: TVMaze's `network.name` vs. Sonarr's `network` (both feed the same
  `NormalizedSeries.network` slot per `filterRegistry.ts`'s rule) — the headline finding above.
- **`webChannel`**: no direct collision today since it's entirely unwired, but if a `network`
  enricher is built without also handling `webChannel`, streaming-exclusive shows will silently
  read as network-less — not a naming collision so much as a completeness gap adjacent to the same
  field.
- **`type`**: TVMaze's `type` (Scripted/Animation/Reality/Talk Show/...) vs.
  `NormalizedSeries.seriesType` (`standard`/`daily`/`anime`, Sonarr-sourced) — same concept, disjoint
  vocabularies, not a safe direct map.
- **`status`**: TVMaze's `status` (`Ended`/`Running`/`To Be Determined`) vs.
  `NormalizedSeries.status` (`continuing`/`ended`/`upcoming`, Sonarr-sourced) — same concept, disjoint
  string vocabularies again.
- **`genres`**: TVMaze vs. Sonarr vs. TMDB, three potential genre-taxonomy sources for the same
  `NormalizedSeries.genres` array — TVMaze would be a third contributor, not a first collision, but
  worth listing since precedence isn't defined for even the current two.
- **`rating`**: TVMaze's `rating.average` (0–10 float) participates in `ratingsAggregation.ts`'s
  blended average alongside TMDB/OMDB ratings that may use different scales — already handled by
  that module's averaging logic, not a raw collision, but noting since the other two providers'
  research docs may flag the same triangulation point independently.

## Structural schema-change gaps (flagged, not designed)

- **Episodes**: no episode-level table/EAV concept exists anywhere in this codebase for any
  provider (confirmed by absence, not deeply audited beyond grep) — wiring `/shows/:id/episodes` or
  `/episodebynumber` would be a new structural concept, not a field addition.
- **Cast/crew**: no person/credit concept exists in `NormalizedSeries`/`NormalizedMovie` — structural.
- **Akas/alternate titles**: no alternate-title concept exists — structural.
- **Schedule** (`time`/`days[]`): no broadcast-schedule concept exists — structural.
- **Images/artwork**: no poster/image field exists on `NormalizedSeries`/`NormalizedMovie` — structural
  (unconfirmed whether any other provider owns this either; flagging as TVMaze-relevant regardless).
- Everything else newly flagged in the show-resource table above (`type`, `runtime`,
  `averageRuntime`, `officialSite`, `weight`, `dvdCountry`, `updated`, full `network`/`webChannel`
  shape beyond name+country) is additive to existing scalar/JSON shapes, **not** structural — call
  these config/mapping gaps, not schema gaps.

## Summary counts

- TVMaze show-resource fields enumerated from live API response: **23** top-level fields (including
  nested `schedule`, `rating`, `network`, `webChannel`, `externals`, `image`, `_links` as single
  units) plus **3** `externals` sub-fields and **4** `network`/`webChannel` sub-fields.
- Fields the codebase's `TvMazeShow` type declares: **8** (`id`, `name`, `type`, `language`,
  `genres`, `status`, `premiered`, `rating.average`, `network.name`/`network.country.name`,
  `externals.{tvrage,thetvdb,imdb}` — counted as one entry each for nested groups: 10 total counting
  sub-fields individually).
- Fields actually *read* by any function today: **5** (`id`, `name`/`premiered` for search
  matching, `rating.average`, `externals.thetvdb`, `externals.imdb`) plus `externals.tvrage` typed
  but unread.
- Endpoints wired: **3 of 10** (`/shows/:id` via `getShow()` — itself unused outside typing since no
  enricher calls it yet, `/search/shows`, `/lookup/shows?thetvdb=`).
- Newly-flagged not-yet-wired fields/tasks (this document's enumeration beyond the ticket's known
  context, i.e. everything above the `network`-enricher headline finding): **~26** — `type`,
  `language` (typed, unused), `genres` (typed, unused — additive to existing multi-source field),
  `status` (typed, unused, vocabulary mismatch), `runtime`, `averageRuntime`, `ended` (date form),
  `officialSite`, `schedule`, `weight`, `webChannel` (full object), `dvdCountry`, `image`,
  `summary`, `updated`, `_links`, `externals.tvrage` (unread), full episode-list endpoint,
  episode-by-number endpoint, cast endpoint, crew endpoint, akas endpoint, seasons endpoint
  (including season-level network/webChannel granularity), images endpoint, `singlesearch`
  endpoint, `embed=` query param, and `lookup/shows`'s unused `imdb=`/`tvrage=` modes. Plus the
  duplicated inline `TvMazeProvider` construction in `providers.procedures.ts` and the missing
  `PROVIDER_REGISTRY` entry as process/config-layer findings (not fields, counted separately above).
