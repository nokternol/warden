---
type: wayfinder-ticket
label: wayfinder:research
status: closed
assignee: claude
blocked_by: []
parent: docs/in_progress/provider-e2e-spec/map.md
---

# Overseerr — research

## Question

Audit Overseerr's full API surface (web research against its official API docs) and cross-check
against what this codebase currently wires (`server/modules/providers/connections/overseerrProvider.ts`
if it exists, `server/modules/providers/providerFactory.ts`, `server/modules/media/enrichment/enricherAdapters.ts`,
`server/modules/media/ruleRegistry.ts`, `src/lib/provider-registry.ts`). Produce a markdown asset
(linked from this ticket, not pasted into it) enumerating, for every field and task/action Overseerr's
API exposes:

- Whether it's already wired into this codebase, and where.
- If not wired: what layer(s) it would touch (db/config surface, provider field, UI filter, query
  engine, enrichment, task/actuator, automation option).
- Any field whose *name* might collide with another provider's field of the same name but different
  meaning (don't resolve the collision here — just flag it for the final precedence ticket).
- Any gap that would require a *structural* schema change (new column/table, not just a new config
  value in the existing `settings` JSON blob) — flag, don't design.

Known context to start from: Wired: getRequests()+getIssues() run through overseerrFieldProvider. Audit request/issue API surface for fields not yet wired, and any actuator-style actions (e.g. approve/deny requests) not yet exposed as tasks.

Do not decide what to build yet — that's the follow-on decision ticket. This ticket is exhaustive
enumeration, not curation.

## Assets

- [research/overseerr.md](../research/overseerr.md) — full field/task enumeration, wired-vs-not
  audit with file/line citations, naming-collision flags, structural-schema-gap flags.

## Resolution

- Wired today is narrow: only `getRequests()`/`getIssues()` → `overseerrFieldProvider` →
  `overseerrRequestStatus` (numeric request-approval status) and `overseerrHasIssue` (boolean
  presence-only, collapses all issue types/statuses into one flag). `search()` exists but feeds
  interactive search, not enrichment.
- No `MediaActuator` exists for Overseerr at all — no `tasks()`, so no approve/decline/retry/delete
  actions are exposed today, unlike Radarr/Sonarr/Plex/Jellyfin/Tautulli which all implement it.
- Enumerated 24 not-wired fields/tasks: 8 request fields (`is4k`, `seasons`, `requestedBy`,
  `modifiedBy`, timestamps, routing config, etc.), 4 issue fields (`issueType`, `createdBy`,
  `modifiedBy`, `comments`), and 11 candidate actuator tasks (approve/decline/retry/delete request,
  update request, resolve/reopen/delete issue, add/delete comment, override media availability
  status). User-management and notification-config endpoint groups exist but are flagged as likely
  out of scope (Overseerr self-admin, not media data) rather than counted as discrete items.
- Flagged collision risk: `status` is triple-overloaded even before cross-provider concerns —
  `MediaRequest.status` (approval state), `MediaInfo.status` (availability state, different enum),
  and issue open/resolved status are three distinct "status" concepts on this provider alone, plus
  a fourth already-live `tmdbStatus` (TMDB release state) elsewhere in the codebase. All are
  plausible "Status" filter labels — flagged for the precedence ticket.
- Flagged structural gaps: 4K vs non-4K requests collapse to one value per title (last-write-wins,
  silently drops one side), per-season request detail is multi-valued and doesn't fit a scalar
  field, and issue comments/issue-type breakdown are unbounded per-issue collections needing a
  child table rather than a config value or single EAV row. Also flagged: the codebase's local
  `OverseerrRequest.type` field isn't present in the current official `MediaRequest` schema —
  possible drift, not resolved here.
