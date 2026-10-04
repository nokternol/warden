---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [01-plex-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Plex — UI pass

## Question

For every field Plex's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/plex.md`, linking any prototype artifacts rather
than pasting them in.

## Progress

The crowding blocker that sat ahead of this ticket — MediaFilterBar rendering every configured
rule's control unconditionally, which doesn't hold up once Plex's 13 new fields join the ~70-field
total across all providers — is resolved: `ref:src/components/MediaFilterBar/FilterPicker.tsx`
implements the add-filter pattern (see `docs/in_progress/provider-e2e-spec/specs/plex.md`'s new "UI
decisions" section for the full writeup), built directly rather than via a throwaway `/prototype`
per explicit direction, with a partial `impeccable` craft pass (shape brief, design-token
compliance, keyboard nav, viewport-edge positioning). Verified in Ladle, not yet in the
authenticated app shell.

Still open: the per-field widget/parameter-shape decisions for Plex's 13 new fields themselves
(`studio`, `runtimeMinutes`, `fileContainer`, `videoCodec`, `audioCodec`, `fileResolution`,
`fileSizeBytes`, `releaseDaysAgo`, `labels`, plus the two joining-existing-rule fields) — this
ticket's original scope — are unaddressed. Each still needs its own widget-shape decision and
`impeccable` pass once its control is built.

## Resolution

- **No field needed a `/prototype` session or a further `impeccable` pass.** Surveyed
  `RuleControl` (`src/components/MediaFilterBar/index.tsx`) and confirmed all 13 fields map onto
  the two existing generic renderers it already switches on by `dataType`: `range` →
  `NumberRangeFilter` (same shape as `sizeOnDiskGb`/`addedDaysAgo`), `csv-strings` →
  `MultiSelectFilter` (same shape as `network`). None of Plex's fields need a bespoke
  widget (no date picker, no slider) — "real UI complexity" per this map's own Notes criterion for
  triggering `/prototype` never materialized here.
- **Remaining decision was the options-source for the 6 net-new `csv-strings` fields**
  (`studio`/`fileContainer`/`videoCodec`/`audioCodec`/`fileResolution`/`labels`), since unlike
  `genres`/`certification` they have no lookups entry yet. Decided with the user: one dedicated
  route per field, following the existing `listNetworks`/`listGenres` precedent
  (`contract/media.ts` + `media.procedures.ts`, in-process `MediaCache<string[]>`,
  dedupe+sort over already-fetched data) — not a combined multi-field "facets" endpoint.
- **Flagged, not fixed**: `certification` already declares `dataType: 'csv-strings'` in
  `ruleRegistry.ts` but has no lookup source wired, so its control silently renders empty today.
  Recorded in the spec as a gap the 6 new routes must not repeat — each new route ships together
  with its `csvStringOptions` branch and `Lookups` field, not as a follow-up.
- Full writeup: `docs/in_progress/provider-e2e-spec/specs/plex.md`'s "Per-field widget shapes"
  subsection (under "UI decisions").

This closes Plex's UI pass. `99-precedence` remains blocked on the other 9 providers' UI tickets.
