---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [02-jellyfin-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Jellyfin — UI pass

## Question

For every field Jellyfin's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/jellyfin.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

- **No field needed a `/prototype` session.** All 13 fields in the spec's "Filter type mapping"
  table map onto `RuleControl`'s existing generic renderers (`range` → `NumberRangeFilter`,
  `csv-strings` → `MultiSelectFilter`, `boolean` → the generic Yes/No toggle), same as
  Plex's 13. No date picker, slider, or other bespoke widget surfaced.
- **First genuinely new boolean rule this map has added**: `jellyfinIsFavorite` (Plex's booleans
  all joined existing rules). Only decision needed was copy, not a widget — add a
  `jellyfinIsFavorite` entry to `BOOLEAN_VALUE_LABELS` (`'Favorited'`/`'Not Favorited'`) rather than
  leaving it on the generic Yes/No fallback, matching the existing labeled-boolean precedent
  (`watched`, `monitored`, etc.).
- **No new lookup route needed.** Every net-new `csv-strings` field in Jellyfin's mapping
  (`studio`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`, `labels`) is a field
  Plex's UI pass already named a dedicated route for; Jellyfin joins those same rules as an
  additional producer rather than minting parallel routes. Recorded as an implementation note
  (aggregate across all configured producers' library data, not just Radarr/Plex) rather than a new
  decision.
- **`removeFromCollection` deferred**: it needs a parameter (target collection id), same shape as
  the already-wired-but-non-functional `addToCollection`. Per this map's cross-cutting finding
  (`AutomationBuilder` has no parameter-input UI at all today), designing a one-off input here was
  explicitly out of scope — deferred to
  [`11-automation-task-parameters`](11-automation-task-parameters.md), which already lists it.
- Full writeup: `docs/in_progress/provider-e2e-spec/specs/jellyfin.md`'s "UI decisions" section.

This closes Jellyfin's UI pass. `99-precedence` remains blocked on the other 8 providers' UI
tickets.
