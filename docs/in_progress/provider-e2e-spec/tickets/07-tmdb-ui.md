---
type: wayfinder-ticket
label: wayfinder:prototype
status: closed
assignee: claude
blocked_by: [07-tmdb-decision]
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tmdb — UI pass

## Question

For every field Tmdb's decision ticket chose to wire as a UI filter, and every task chosen to
expose as an automation option: prototype (`/prototype`) any that need real UI thought (parameters,
non-trivial filter widget shape — e.g. a range vs. a multi-select vs. a date picker), then run an
`impeccable` pass on the resulting filter UI (per field) and automation UI (per task). Record the
UI/UX decisions (widget choice, parameter shape, copy) back into
`docs/in_progress/provider-e2e-spec/specs/tmdb.md`, linking any prototype artifacts rather
than pasting them in.

## Resolution

No `/prototype` session needed — every filterable field maps onto an existing `RuleControl`
renderer. No tasks exist for TMDB (read-only metadata, no `MediaActuator` role), so nothing was
appended to `11-automation-task-parameters`, unlike every prior provider's UI pass.

`genres`/`certification`/`year` confirmed as joining the existing shared rules with no new key,
route, or widget. Of the three `csv-strings` judgment calls: `originCountry` and `spokenLanguages`
both resolved (b) — hardcoded fixed-array branches in `lookup` (ISO-3166-1 country codes,
ISO-639-1 language codes), following `overseerrIssueType`'s precedent for closed,
externally-standardized vocabularies rather than per-instance runtime data, despite `originCountry`'s
larger size (~250 codes) than any prior fixed-array example. `keywords` resolved (a) — a new
dedicated `tmdbKeywords` `Lookups` route, following `plexLabels`/Jellyfin `Tags`'s precedent for
open, unbounded, per-item tag vocabularies; confirmed no existing route to reuse, since Plex/Jellyfin
tags are separate provider-specific tag spaces from TMDB's editorial keywords. `hasTrailer` and all
8 streaming-service booleans got `valueLabels` entries (8 independent boolean rules per the
decision ticket, not one aggregate rule — labels listed in full in `specs/tmdb.md`).

Flagged for OMDB's UI ticket (next): OMDB's `Country` field is single-valued, joining `originCountry`
as an additional producer of a multi-value `csv-strings` rule — needs wrapping as a one-element array
at the query-engine layer (not a UI-layer concern, but worth naming so it isn't rediscovered). Full
reasoning and the exact copy tables are in `specs/tmdb.md`'s "UI decisions" section.
