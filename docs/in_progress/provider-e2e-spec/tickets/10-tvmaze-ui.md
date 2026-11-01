---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [10-tvmaze-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tvmaze — UI pass

> **Written before rule presentation moved to the server.** The decisions here stand; the mechanics they
> name do not. A rule now declares its presentation on the descriptor in `ruleRegistry.ts`:
> `BOOLEAN_VALUE_LABELS` is `valueLabels`, `ENUM_OPTIONS` is `options`, `SEGMENT_LABEL_OVERRIDES` is
> `shortLabel`, `csvStringOptions` and `csvIdOptions` are `lookup` (which names an API procedure, so it has
> no branches), `csv-ids` is `instance-ids`, and `ruleRendersControl` is gone. Line references into
> `MediaFilterBar` are out of date. A `string` rule with no `options` renders a text filter, a `csv-strings`
> rule with a fixed list has no descriptor shape yet and needs one added, and a rule that cannot be described
> is not served at all, so it has no control rather than an empty one.

## Question

For every field Tvmaze's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/tvmaze.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

No `/prototype` session needed — every filterable field maps onto an existing `RuleControl`
renderer. `network`/`genres`/`status`/`releaseDate`/`runtime` all join existing shared rules
(`csv-strings`/`csv-strings`/`string`/`range`/`range`) as additional producers, no new key, route,
or widget. `tvmazeEndedAt` and `weight` are both new `range` rules — plain `NumberRangeFilter`, no
lookup needed.

**`tvmazeType` and `language`, the two fields flagged for scrutiny, both resolved as closed
enums — this is not the third free-text-gap occurrence.** TVMaze's own FAQ
(`tvmaze.com/faq/13/shows`) documents `type` as "an objective and categorical definition" with an
explicit 11-value list (Scripted, Animation, Reality, Talk Show, Documentary, Game Show, News,
Sports, Variety, Award Show, Panel Show) — closed by editorial convention even though the API's
`TvMazeShow.type` is typed as a bare `string`. Same FAQ states language is constrained to ISO 639-1
codes ("Only languages that exist in the ISO 639-1 standard are available on TVmaze"). Both get new
`ENUM_OPTIONS` entries (not `csvStringOptions` hardcoded arrays, since both are single-value
`dataType: string` rules, unlike TMDB's array-valued `originCountry`/`spokenLanguages`): `tvmazeType`
transcribed in full (11 values), `language` seeded from a common working subset with the full
ISO 639-1 table sourced at implementation time. The free-text-gap count (Radarr's `folderName`/
`path`, Sonarr's `path`) stays at two — no shared free-text control built.

No tasks exist for TVMaze, so nothing appended to `11-automation-task-parameters`.

Full reasoning and the exact `ENUM_OPTIONS` value tables are in `specs/tvmaze.md`'s "UI decisions"
section.

This closes the last *per-provider* UI ticket this session's ticket queue assigned to `claude` in
the map. `99-precedence` is **not yet unblocked**: its `blocked_by` list names all ten UI tickets
(`01`–`10`) individually, and `09-seerr-ui` is still `status: open`/`assignee: null` — Seerr has its
own real UI ticket (not folded into Overseerr's, despite the map's decision-ticket summary reading
that way) and it hasn't been picked up yet. Whoever runs the next wayfinder session should claim and
close `09-seerr-ui` next; `99-precedence` becomes unblocked only once that lands.
