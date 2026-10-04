---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [04-sonarr-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Sonarr — UI pass

## Question

For every field Sonarr's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/sonarr.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

- **No field needed a `/prototype` session.** Sonarr adds zero new widget shapes — every filterable
  field maps onto the four generic `RuleControl` renderers already established across
  Plex's/Jellyfin's/Radarr's UI passes (`range`, `csv-ids`, `boolean`, `string`/`ENUM_OPTIONS`).
- **`languageProfileId`** — wired as `csv-ids`, but *not* a reuse of `qualityProfiles`'s
  `{ radarr, sonarr }` paired shape: language profiles only exist on Sonarr, so
  `Lookups.languageProfiles` is a new flat `MediaQualityProfile[]` field (reusing the existing
  `MediaQualityProfile` shape) plus a new `csvIdOptions` branch and `/api/media/language-profiles`
  route — genuinely new lookup, not a joined route.
- **`nextAiring`** — resolved (not left flagged): filter key is `nextAiringInDays`, not
  `nextAiringDaysAgo`. The "days ago" suffix is load-bearing across every existing range-over-dates
  rule (all past-tense); reusing it on a forward-looking value would silently invert what min/max
  mean relative to every sibling filter. Same `NumberRangeFilter` control either way — copy/key
  decision only, no widget change.
- **`path`** — dropped from filterable scope, matching Radarr's `folderName`/`path` precedent
  exactly (display-only, no free-text `dataType` invented). Flagged explicitly: this is now the
  *second* provider to hit the identical gap (no substring-match control exists anywhere in
  `ruleRegistry.ts`), which is worth watching — a third independent occurrence would tip this from
  "defer" to "build the shared control," but two doesn't yet justify one provider ticket deciding it
  unilaterally.
- **`seasonCount`** — reclassified `number` → `range`, same reasoning and shape as Radarr's
  `movieFileCount` (small integer counts aren't a fixed enum; a range with equal min/max still
  expresses exact match).
- **`episodeCount`/`totalEpisodeCount`** — mapping table's single-range-spans-both-fields framing
  confirmed sound, no other action. **`episodeFileCount`** confirmed to need no widget of its own
  (backs the `hasFile` predicate fix, not a separate rule).
- **`moveSeries`** (root folder, single-select) and **`changeLanguageProfile`** (language profile id,
  single-select, instance-scoped) both need parameters — deferred to
  [`11-automation-task-parameters`](11-automation-task-parameters.md) per this map's cross-cutting
  finding, both shapes appended to that ticket's body (not designed here). All other
  new/completed tasks (`deleteSeriesKeepFiles`, `refreshSeries`, `rescanSeries`, `renameSeries`) need
  no parameter and render on the existing task list unchanged.
- Full writeup: `docs/in_progress/provider-e2e-spec/specs/sonarr.md`'s "UI decisions" section.

This closes Sonarr's UI pass. `99-precedence` remains blocked on the other 4 providers' UI tickets
(Tautulli, Overseerr, TMDB/OMDB, TVMaze — per map.md's provider list).
