---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [06-overseerr-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Overseerr — UI pass

> **Written before rule presentation moved to the server.** The decisions here stand; the mechanics they
> name do not. A rule now declares its presentation on the descriptor in `ruleRegistry.ts`:
> `BOOLEAN_VALUE_LABELS` is `valueLabels`, `ENUM_OPTIONS` is `options`, `SEGMENT_LABEL_OVERRIDES` is
> `shortLabel`, `csvStringOptions` and `csvIdOptions` are `lookup` (which names an API procedure, so it has
> no branches), `csv-ids` is `instance-ids`, and `ruleRendersControl` is gone. Line references into
> `MediaFilterBar` are out of date. A `string` rule with no `options` renders a text filter, a `csv-strings`
> rule with a fixed list has no descriptor shape yet and needs one added, and a rule that cannot be described
> is not served at all, so it has no control rather than an empty one.

## Question

For every field Overseerr's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/overseerr.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

No `/prototype` session needed — every filterable field maps onto an existing `RuleControl`
renderer once correctly classified. `overseerrRequestedAt`, `overseerrIssueStatus`,
`overseerrHasComments`, and `overseerrRequestScope` confirmed as mapped (`range`, `number`/
`ENUM_OPTIONS`, `boolean`/`BOOLEAN_VALUE_LABELS`, `string`/`ENUM_OPTIONS` respectively).
`overseerrRequestedBy` was reclassified from `string` to `csv-strings` — it's an open, per-instance
requester list (not a fixed enum), but unlike Radarr's/Sonarr's `path` gap it *is* enumerable at
query time, so it fits the existing `csv-strings` + `Lookups` shape rather than needing a new
free-text control; gets a new dedicated `overseerrRequesters` lookup route. `overseerrIssueType`
stays `csv-strings` but resolved to a hardcoded fixed-array branch in `csvStringOptions` (Overseerr's
own fixed API vocabulary, four values, not per-instance data) rather than a `Lookups` route — the
first fixed-and-small `csv-strings` set in this map, no existing precedent to reuse but the mechanism
already fits with zero renderer changes.

Three tasks (`Update request`, `Add issue comment`, `Override media availability status`) need
parameter-collection UI beyond anything `AutomationBuilder` supports today; each was characterized
and appended to `11-automation-task-parameters`'s "Parameter shapes recorded by deferring tickets"
section with its distinct shape (multi-field / free-text / multi-field) rather than designed here,
per that ticket's ownership of the actual input UI. Full reasoning and corrected mapping table in
`specs/overseerr.md`'s "UI decisions" section.
