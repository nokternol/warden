---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [08-omdb-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Omdb — UI pass

## Question

For every field Omdb's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/omdb.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

No `/prototype` session needed — every filterable field maps onto an existing `RuleControl`
renderer. No tasks exist for OMDB (read-only lookup service, no `MediaActuator` role), so nothing
was appended to `11-automation-task-parameters`, matching TMDB's and Tautulli's UI passes.

`certification`/`genres`/`runtime`/`originCountry` confirmed as joining existing shared rules
(`csv-strings`/`csv-strings`/`range`/`csv-strings`) with no new key, route, or widget. The
carry-forward from TMDB's UI ticket — OMDB's single-valued `Country` needing to wrap as a
one-element array to feed the multi-value `originCountry` rule — is confirmed as a
query-engine/provider-field-layer concern, not a widget-shape one; no UI control changes, noted in
`specs/omdb.md` so it isn't lost before that layer is implemented.

`awardWinner` and `oscarWinner` are new OMDB-only `boolean` rules (no existing rule to join), both
given distinct `valueLabels` entries: `awardWinner` → "Award Winner"/"No Awards",
`oscarWinner` → "Oscar Winner"/"No Oscar" — separate copy since they're independent signals.

On-demand metadata fields (`Director`/`Writer`/`Actors`/`Plot`/`BoxOffice`/raw `Awards` text/
`Poster`/`DVD`/`Production`/`Website`) confirmed correctly excluded from the filter mapping, not
reopened.

Full writeup: `docs/in_progress/provider-e2e-spec/specs/omdb.md`'s "UI decisions" section.

This closes OMDB's UI pass. `99-precedence` remains blocked on TVMaze's UI ticket (also task-free,
last provider's per-provider UI pass before the map's final precedence ticket).
