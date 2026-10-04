---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Tautulli — research

## Question

Audit Tautulli's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/tautulliProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/ruleRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Tautulli's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Wired: getHistory() runs through tautulliFieldProvider into contestedFieldPrecedence fields, gated into ruleRegistry (watched, lastWatchedDaysAgo). Audit for other Tautulli API surface (e.g. per-user stats, transcode stats) not yet wired.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [Tautulli API surface audit](../research/tautulli.md)

## Resolution

- Corrects the ticket's own premise: `TautulliProvider` already implements `MediaActuator` with one
  task, `deleteWatchHistory` (destructive, media-affecting) — Tautulli is not task-free.
- Wired today: `get_history` → `tautulliFieldProvider` → `playCount`/`lastWatchedAt` →
  `contestedFieldPrecedence` (Tautulli beats Plex) → `watched`/`lastWatchedDaysAgo` filters.
  `get_libraries_table` and `get_home_stats` are also called by the provider class but their results
  go nowhere downstream today.
- Largest not-wired category is per-user data (`get_users`, `get_user_watch_time_stats`,
  `get_user_player_stats`, `get_user_ips`, `get_user_logins`) — all *user*- or *(user, item)*-scoped,
  which doesn't fit the current per-item-only `EnrichmentFields` shape and is flagged as a structural
  gap, not just an unwired field.
- Also not wired: transcode/stream-quality data (`get_stream_data`), live session state
  (`get_activity`, `terminate_session` — doesn't fit the enrichment model at all, would need its own
  feature surface), library-level stats, and notifier management (nested per-agent config, doesn't
  fit the flat `settings` JSON blob).
- Naming-collision risks flagged: `playCount`/`lastWatchedAt` vs Plex (already resolved via existing
  precedence, confirmed genuinely distinct measurements — Tautulli counts completed plays, Plex
  counts opens); a future `get_recently_added` wiring would introduce a third "added" concept beyond
  the Plex/Radarr collision the map already names; per-user play counts would collide in name
  (`plays`) but differ in cardinality from the existing per-item `playCount`.
