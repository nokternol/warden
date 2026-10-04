---
type: wayfinder-spec
label: wayfinder:spec
provider: sonarr
status: implementing
source_ticket: docs/in_progress/provider-e2e-spec/tickets/04-sonarr-decision.md
source_research: docs/in_progress/provider-e2e-spec/research/sonarr.md
---

# Sonarr — E2E spec

Sonarr is a `MediaSource` (show) + `MediaActuator`, symmetric to Radarr — see
[`specs/radarr.md`](radarr.md) for the parallel shared decisions (delete-keep-files, move task,
refresh/rescan/rename tasks, queue/history and instance-scoped commands all out of scope, and the
permanent `added`/`plexAddedAt` split). This file covers Sonarr-specific field/task decisions.

## Bug fix (in scope, not new capability)

The `hasFile` filter rule lists Sonarr as a `sourceProvider`, but `NormalizedSeries` has no `hasFile`
field — the predicate always reads `undefined`, so the filter silently never matches a show. Fixed by
deriving a real per-series equivalent instead of just excluding Sonarr from the rule:

- **`hasFile` (show) = `episodeFileCount > 0`** — at least one episode file present. Mirrors Radarr's
  `hasFile` semantics (movie has its file) applied at the series level: "any content downloaded," not
  "fully downloaded." Requires `statistics.episodeFileCount` to be wired (see below).

## Fields to wire

### Identity fields (not enrichment)

Per domain framing: external system IDs are the identity-matching job, not enrichment data. These add
to `NormalizedSeries._sourceIds` (`series.ts`), not `EnrichmentFields`.

| Field | Source | Notes |
|---|---|---|
| `_sourceIds.imdb` | `imdbId` | `NormalizedMovie._sourceIds` already has `imdb`; `NormalizedSeries._sourceIds` doesn't — adding this closes that asymmetry. Schema-shaped (new optional field on an existing interface), not a table/column change. |
| `_sourceIds.tvmaze` | `tvMazeId` | Already typed on `SonarrSeries` (`sonarrProvider.ts:24`) but never read. New identity slot, same non-structural shape as `imdb` above. |

### Series fields (source-owned, flow: `sonarrProvider.ts` → `normalizeMedia.ts` → `NormalizedSeries` → `ruleRegistry.ts`)

| Domain field | Source | Notes |
|---|---|---|
| `nextAiring` | `nextAiring` | Symmetric to the already-wired `previousAiring`/`lastAiredAt` — "next episode in N days" filter. |
| `path` | `path` | Filesystem location — filter + display. |
| `images` | `images[]` | Poster/fanart — display only, not a filter/query concern. |
| `seasonCount` | `statistics.seasonCount` | |
| `episodeFileCount` | `statistics.episodeFileCount` | Also backs the `hasFile` bug fix above. |
| `episodeCount` / `totalEpisodeCount` | `statistics.{episodeCount,totalEpisodeCount}` | |

**Not wired, no action needed**: `profileId` — legacy v2 field superseded by `qualityProfileId`,
appears dead in Sonarr's own API. No wiring; flagged for completeness only.

**Ratings extracted to a dedicated intent doc**: `ratings.votes` (alongside the already-live
`communityRating` value) moved to
[`docs/intent/media-ratings-provider.md`](../../../intent/media-ratings-provider.md) — see that doc
for why ratings don't fit the shared-EnrichmentFields pattern the rest of this spec uses. The
already-live `communityRating` field is unaffected.

## Language-profile track (new capability, mirrors the existing quality-profile pattern)

Sonarr has no equivalent of Radarr's quality-profile completeness for language profiles today — no
fetch method, no filter, no task. Building the full parallel track:

- `getLanguageProfiles()` — new fetch method on `SonarrProvider` (mirrors `getProfiles()`).
- `languageProfileId` filter — instance-scoped, same pattern as `qualityProfileIds`.
- `changeLanguageProfile` task — `PUT series/editor` with `languageProfileId`, same shape as
  `changeQualityProfile`.

## Tasks / automation options

Already real (unchanged): `unmonitorSeries`, `triggerSearch`, `deleteSeriesWithFiles`,
`changeQualityProfile`, `addTag`, `removeTag`.

| New/completed task | Endpoint | Notes |
|---|---|---|
| `deleteSeriesKeepFiles` | DELETE `series/{id}` with `deleteFiles=false` | Completes the existing `modelledRun` stub — same fix as Radarr's `deleteMovieKeepFiles`, second DELETE call shape rather than unblocking the stub as-is. |
| `moveSeries` | equivalent PUT-based move (root folder change) | Parameterized by target root folder (`getRootFolders()` already fetched, previously unused). |
| `refreshSeries` | `RefreshSeries` command | Refreshes metadata from the indexer (TheTVDB) without touching disk. |
| `rescanSeries` | `RescanSeries` command | Rescans disk for existing files without searching for new ones; distinct from `refreshSeries`. |
| `renameSeries` | `RenameSeries` command | Applies the configured naming format to series folder/files. |
| `changeLanguageProfile` | `PUT series/editor` | See language-profile track above. |

**Out of scope this pass, structural**: `EpisodeSearch`, `SeasonSearch`, `RenameFiles` — need
episode/season/file-level targeting; `ActuatorTargetId` only addresses at the series level today, no
nested addressing space exists. `MissingEpisodeSearch`, `RssSync`, `Backup`,
`DownloadedEpisodesScan` — instance-scoped, same as Radarr's instance-scoped exclusions.

## Out of scope (structural, flagged not designed)

- **Per-season data** (`seasons[]`: `seasonNumber`, `monitored`) — the current model normalizes a
  series to one flat row; per-season monitor state or filtering needs a child table.
- **Queue and history endpoints** — same shape/scope note as Radarr's spec; not per-series scalar
  facts, doesn't fit `media_enrichment`.

## Naming-collision notes (for the final precedence ticket)

- **`network`** — Sonarr's `network` and TVMaze's `network` both feed the same `network` filter rule
  (`providers: [SONARR, TVMAZE]`). Sonarr's is current-network-per-TheTVDB-record; TVMaze's can
  differ and additionally has a separate `webChannel` field. Not resolved here — TVMaze's own
  decision ticket owns the full resolution.
- **`certification`** — see Radarr's spec; same value-format risk, shared verbatim key across four
  providers.
- **`tags`** — Sonarr and Radarr both produce `tags: number[]` with identical shape but separate id
  spaces per instance; already correctly handled via `instanceScoped: true`. Same treatment should
  extend to the new `languageProfileId` filter.
- **`added`** — see Radarr's spec; Sonarr's `added` (addedAt-to-source) stays permanently distinct
  from Plex's `plexAddedAt` (addedAt-to-library), already separate filter rules today.

## Implementation status

Every field row below is implemented. `moveSeries`/`changeLanguageProfile` (see Tasks) are not:
both need a single-select task parameter `AutomationBuilder` has no UI for yet, mirroring
Radarr's `moveMovie` gap. Blocked on `tickets/11-automation-task-parameters.md`'s implementation.
Tracked in `specs/_implementation-map.md`.

## Filter type mapping

| Domain field | Filter key | dataType | Notes |
|---|---|---|---|
| `languageProfileId` | `languageProfileIds` | `csv-ids` | New rule; instanceScoped, same pattern as the existing `qualityProfileIds` show rule. |
| `nextAiring` | `nextAiringDaysAgo` | `range` | New rule; "days ago" framing doesn't fit a future date — see below. |
| `path` | `path` | `string` | New rule; substring match, same shape as `title`. |
| `images` | — | — | No filter, display/on-demand only (poster/fanart, per spec's own note). |
| `seasonCount` | `seasonCount` | `number` | New rule; exact/threshold match on a small integer count. |
| `episodeFileCount` | — | — | No filter mapping of its own — backs the `hasFile` rule's predicate fix (already an existing rule) rather than exposing a separate filter. |
| `episodeCount` / `totalEpisodeCount` | `episodeCount` | `range` | New rule; joins the numeric-range convention already used for `episodePercentage`/`seasonCount`-adjacent counts. Covers both fields as a min/max span (`totalEpisodeCount` is the practical upper bound users filter against; `episodeCount` alone is redundant with `episodePercentage`, already wired). |

Note on `nextAiring`: the file's own dates-as-range convention is "days ago" for *past* events
(`addedDaysAgo`, `plexAddedDaysAgo`, `lastAiredDaysAgo`). `nextAiring` is forward-looking (next
episode in N days), so `nextAiringDaysAgo` is a naming mismatch — flagged here, not resolved: the
range mechanics (`inRange` over a day-count) are identical either direction, only the sign/label
differs. Leaving the exact key name (`nextAiringDaysAgo` vs. `nextAiringInDays`) to whoever wires
the rule.

### Tasks (automation options)

- `deleteSeriesKeepFiles` — none (acts on the already-targeted series, no extra parameter).
- `moveSeries` — single-select (target root folder, from `getRootFolders()`).
- `refreshSeries` — none.
- `rescanSeries` — none.
- `renameSeries` — none.
- `changeLanguageProfile` — single-select (target language profile id, instance-scoped, same shape as `changeQualityProfile`).

## UI decisions

Same generic-control survey as `specs/plex.md`'s "Per-field widget shapes" and `specs/radarr.md`'s
mirror of it — **no field needed a `/prototype` session or a further `impeccable` pass.** Sonarr adds
zero new widget shapes to `RuleControl`; every filterable field maps onto the four generic renderers
already established (`range` → `NumberRangeFilter`, `csv-ids` → `MultiSelectDropdown`, `boolean` →
`OptionFilter`, `string`/`number` → `OptionFilter` with a fixed `ENUM_OPTIONS` entry — unused by any
Sonarr field this pass). This closes out the items the ticket flagged for scrutiny:

### `languageProfileId` — `csv-ids`, new dedicated lookup (not a `qualityProfiles`-shaped pair)

Confirmed via `csvIdOptions` (`ref:src/components/MediaFilterBar/index.tsx#L916`) that
`qualityProfileIds` branches on `scope` (`movie` → `lookups.qualityProfiles.radarr`, `show` →
`lookups.qualityProfiles.sonarr`) because quality profiles exist as a concept on both Radarr and
Sonarr. Language profiles are Sonarr-only — Radarr has no equivalent concept — so mirroring the
`{ radarr: [...], sonarr: [...] }` pair shape on `Lookups.qualityProfiles` would be wrong: it would
imply a `radarr` producer that can never exist and force every consumer to branch on a scope that
only ever has one live side.

**Decision: add a flat `Lookups.languageProfiles: MediaQualityProfile[]` field** (reusing the
existing `MediaQualityProfile` shape — `{ id, name, providerId, providerName }` — since a language
profile is structurally identical to a quality profile: an instance-scoped id/name pair), not a
`{ radarr, sonarr }` record. `csvIdOptions` gets a new branch:

```
if (rule.key === 'languageProfileIds') {
  return lookups.languageProfiles.map((p) => ({
    id: p.id,
    displayName: p.name,
    providerId: p.providerId,
    providerName: p.providerName,
  }));
}
```

No `scope` branch needed inside it (unlike `qualityProfileIds`) — this rule only ever renders for
`show` scope, so there's nothing to switch on. `useMediaLookups.ts` gets a new
`/api/media/language-profiles` route + `languageProfiles: MediaQualityProfile[]` in its return,
following `qualityProfiles`'s fetch-and-default-empty-array pattern. `instanceScoped: true` carries
through unchanged (same as `qualityProfileIds`/`tagIds`), per the decision ticket's own note that the
new filter should extend the existing instance-scoping treatment.

### `nextAiring` — resolved as `nextAiringInDays`, not `nextAiringDaysAgo`

The spec's own note is right that "days ago" doesn't fit a forward-looking value. Resolving rather
than leaving flagged: **the filter key is `nextAiringInDays`**, not `nextAiringDaysAgo`. Reasoning:

- Every existing "days ago" key in the registry (`addedDaysAgo`, `plexAddedDaysAgo`,
  `lastAiredDaysAgo`, Radarr's `inCinemasDaysAgo`/`physicalReleaseDaysAgo`/`digitalReleaseDaysAgo`)
  names a *past* event, and the "ago" suffix is doing real semantic work — it tells a reader the
  min/max bounds count backwards from now. Reusing that suffix on a future value would make
  `min: 3, max: 7` silently mean the opposite direction of every sibling range filter with no visual
  cue, which is a worse outcome than an inconsistent name.
- `nextAiringInDays` keeps the field's own name (`nextAiring`) recognizable, reads correctly
  forward ("next episode airs in N days"), and only costs one filter key deviating from the "ago"
  convention family — a family that convention only applies to past-tense fields in the first place,
  so `nextAiring` was never really a candidate for it.
- No control change: `NumberRangeFilter` is direction-agnostic: `inRange` over a day-count works
  identically whichever way the sign points. This is purely a key-name/copy decision, not a widget
  decision, so no `/prototype` session applies.

**Correction to the "Filter type mapping" table above**: `nextAiring`'s filter key is
`nextAiringInDays`, not `nextAiringDaysAgo`.

### `path` — dropped from filterable scope, per Radarr's precedent

Same situation Radarr hit with `folderName`/`path`: `string` dataType is strictly a fixed-enum
picker keyed by `ENUM_OPTIONS[rule.key]` (confirmed again via `RuleControl`'s `string`/`number`
branch) — never free text, and no free-text/substring `dataType` exists anywhere in
`ruleRegistry.ts`. Sonarr's `path` is described in the spec as "substring match, same shape as
`title`" — the identical mismatch, not a new one.

**Decision: leave `path` display-only, matching Radarr's precedent exactly.** This is the second
occurrence of the same gap (Radarr's `folderName`/`path`, now Sonarr's `path`), which is worth
naming explicitly rather than quietly repeating: two independent providers have now hit "no
substring-match control exists" for a filesystem-path field. Still not designing the shared
free-text `dataType` here — that's a cross-cutting decision bigger than one provider's UI ticket,
per Radarr's own reasoning — but flagging it as a live candidate for whichever future ticket
next needs it (e.g. an id/title-search field), since a third occurrence would make deferral start to
look like avoidance rather than caution. See the ticket-level report for this flagged explicitly to
the caller.

**Correction to the "Filter type mapping" table above**: `path`'s row should be read as no filter
rule (drop the `string` dataType entry), wired only for display — same treatment as `overview`/
title-variant fields and Radarr's `folderName`/`path`.

### `seasonCount` — reclassified to `range`

Same reasoning as Radarr's `movieFileCount`: `number` dataType is the fixed-`ENUM_OPTIONS`-picker
shape, not a numeric input, and season counts (0, 1, 2, 3…) have no natural small enum the way a
status code does.

**Decision: reclassify `seasonCount` to `range` dataType**, same shape as `episodeCount` and
`sizeOnDiskGb`. A `NumberRangeFilter` with equal min/max still expresses exact-count match ("has
exactly 3 seasons"), while also supporting open-ended "5 or more seasons" queries for free. No new
widget.

**Correction to the "Filter type mapping" table above**: `seasonCount`'s dataType is `range`, not
`number`.

### `episodeCount` / `totalEpisodeCount` — mapping table framing confirmed, no other action

Single `range` rule (`episodeCount`) spanning both fields' min/max is a sound framing — matches the
spec's own reasoning that `totalEpisodeCount` is the practical filter ceiling and `episodeCount`
alone is redundant with the already-wired `episodePercentage`. No widget decision beyond the
existing `range` → `NumberRangeFilter` mapping.

### `episodeFileCount` — confirmed no separate widget

Backs the `hasFile` predicate fix only (per the bug-fix section above) — not exposed as its own
filter rule, so no `RuleControl` branch or lookup applies. No widget decision needed.

### Per-field widget shapes — full mapping

- **`range` fields**: `nextAiringInDays` (renamed, see above), `seasonCount` (reclassified, see
  above), `episodeCount` (spans `episodeCount`/`totalEpisodeCount`). All render via
  `NumberRangeFilter`, no new bounds decided, consistent with prior providers' precedent of leaving
  numeric rules unbounded.
- **`csv-ids`**: `languageProfileIds` — new dedicated `Lookups.languageProfiles` field and
  `csvIdOptions` branch (see above), not a reuse of `qualityProfiles`'s paired shape.
- **Dropped from filterable scope**: `path` (see above, matches Radarr's `folderName`/`path`
  precedent), plus the already-noted not-filtered set (`images`, `profileId`).
- **No new `boolean` or `string`/`ENUM_OPTIONS` fields this pass** — `hasFile`'s predicate fix reuses
  the existing rule/control, no new boolean surfaces.

### Tasks

- **`deleteSeriesKeepFiles`, `refreshSeries`, `rescanSeries`, `renameSeries`** — no parameter, no
  automation-UI decision needed; render on the existing plain id/label task list unchanged (confirmed
  same shape as Radarr's `deleteMovieKeepFiles`/`refreshMovie`/`rescanMovie`/`renameMovies`).
- **`moveSeries`** needs a parameter (target root folder) — same shape as Radarr's `moveMovie`
  (single-select via `getRootFolders()`). Deferred to
  [`tickets/11-automation-task-parameters.md`](../tickets/11-automation-task-parameters.md), not
  designed here.
- **`changeLanguageProfile`** needs a parameter (target language profile id, instance-scoped) — same
  "single-select from a fetched list" shape as `moveMovie`/Jellyfin's `removeFromCollection`, sourced
  from the new `getLanguageProfiles()` fetch method / `languageProfiles` lookup named above. Also
  deferred to ticket 11, not designed here.

Both parameter shapes are appended to ticket 11's "Parameter shapes recorded by deferring tickets"
section rather than designed in this ticket.
