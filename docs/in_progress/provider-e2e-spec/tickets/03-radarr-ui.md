---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [03-radarr-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Radarr — UI pass

> **Written before rule presentation moved to the server.** The decisions here stand; the mechanics they
> name do not. A rule now declares its presentation on the descriptor in `ruleRegistry.ts`:
> `BOOLEAN_VALUE_LABELS` is `valueLabels`, `ENUM_OPTIONS` is `options`, `SEGMENT_LABEL_OVERRIDES` is
> `shortLabel`, `csvStringOptions` and `csvIdOptions` are `lookup` (which names an API procedure, so it has
> no branches), `csv-ids` is `instance-ids`, and `ruleRendersControl` is gone. Line references into
> `MediaFilterBar` are out of date. A `string` rule with no `options` renders a text filter, a `csv-strings`
> rule with a fixed list has no descriptor shape yet and needs one added, and a rule that cannot be described
> is not served at all, so it has no control rather than an empty one.

## Question

For every field Radarr's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/radarr.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

- **No field needed a `/prototype` session.** Radarr adds zero new widget shapes — every filterable
  field maps onto the four generic `RuleControl` renderers already established across
  Plex's/Jellyfin's UI passes (`range`, `csv-strings`, `boolean`, `string`/`ENUM_OPTIONS`).
- **`radarrStatus`** — confirmed as a legitimate `string`/`ENUM_OPTIONS` rule (same shape as
  `seriesStatus`/`tmdbStatus`). Real enum decided from the research ticket's Radarr-API audit:
  `tba`/`announced`/`inCinemas`/`released`/`deleted`.
- **`folderName`/`path`** — dropped from filterable scope this pass rather than inventing a new
  free-text/substring `dataType`. Confirmed via `RuleControl` that `string` is strictly a fixed-enum
  picker, never free text, and that no free-text dataType exists anywhere in `ruleRegistry.ts`
  today. Left display-only, matching `overview`/title-variant fields' existing precedent. Inventing a
  shared free-text control is flagged as a future decision if a later provider independently hits the
  same need — not designed here.
- **`movieFileCount`** — reclassified from `number` to `range` (same shape as `sizeOnDiskGb`); a
  range with equal min/max still expresses exact-count match, avoiding a bespoke control for a value
  space with no natural small enum.
- **`collectionName`/`collectionTmdbId`** — scoped `collectionName` only, per a new dedicated
  `csv-strings` lookup route (not covered by Plex's/Jellyfin's UI passes — genuinely new field).
  `collectionTmdbId` stays unfiltered; no confirmed id-based use case.
- **`releaseGroups`** is also genuinely new (not covered by Plex/Jellyfin) and gets its own dedicated
  `csv-strings` route. **`studio` is not new** — joins the shared route Plex's UI pass already named
  across Plex/Radarr/Jellyfin.
- **`moveMovie`** needs a parameter (target root folder, single-select via `getRootFolders()`) —
  deferred to [`11-automation-task-parameters`](11-automation-task-parameters.md) per this map's
  cross-cutting finding, with the parameter's shape appended to that ticket's body (not designed
  here). All other new/completed tasks (`deleteMovieKeepFiles`, `refreshMovie`, `rescanMovie`,
  `renameMovies`, `refreshCollection`) need no parameter and render on the existing task list
  unchanged.
- Full writeup: `docs/in_progress/provider-e2e-spec/specs/radarr.md`'s "UI decisions" section.

This closes Radarr's UI pass. `99-precedence` remains blocked on the other 7 providers' UI tickets.
