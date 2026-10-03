# System vs User Automations

## The distinction

Warden has two flavours of automation, both stored in the `automations` table and scheduled
by the same underlying infrastructure, distinguished by a `kind` column.

| | System | User |
|---|---|---|
| `kind` | `'system'` | `'user'` |
| Created by | Application startup (health check upsert) | User via UI |
| Editable | No — schedule and task are fixed by the application | Yes — fully configurable |
| Deletable via API | No | Yes |
| Visible in UI | System panel (settings/system) | Main dashboard |
| Schedule source | Hardcoded default, upserted at startup | User-defined, stored in DB |
| Purpose | Infrastructure that makes user automations possible | The reason the application exists |

## Why same table

System and user automations share the same mechanisms: they are scheduled by
`AutomationScheduler`, executed by `AutomationExecutor`, and their runs recorded in
`automation_runs`. A `kind` column is the minimal change to preserve this while enabling
correct visibility and access control.

Separate tables would duplicate the run-recording pattern and create parallel service
infrastructure for what is fundamentally the same operation with different ownership.

## System automations

System automations are invariants — they must always exist for Warden to function. The
startup health check ([`server/modules/system/systemHealthCheck.ts`](ref:path:server/modules/system/systemHealthCheck.ts)) upserts them on every boot.
If a container restarts and a system job is missing, it is restored automatically.

Current system automations (added in Phase 2):
- **Identity Resolution Job** — maps Radarr/Sonarr items to cross-provider IDs
- **Enrichment Job** — fetches Tier 2 provider data for enriched filter predicates

Both are prerequisites for Tier 2 filter predicates to return meaningful results.

## Enforcement

`kind TEXT NOT NULL DEFAULT 'user'` is carried on both the `automations` and `automation_runs`
tables (`server/database/schema.ts:153,204`).

- `DELETE /api/automations/:id` and `PATCH /api/automations/:id/status` both reject `kind = 'system'`
  (`automationService.ts`'s `assertMutable` check).
- `GET /api/automations` is filterable by `kind` (`automationService.list({ kind })`).

## UI placement

- **Main dashboard / Automations** ([`src/components/AutomationRow/index.tsx`](ref:path:src/components/AutomationRow/index.tsx)) — user automations,
  fully configurable, run history, Run Now + Disable/Enable + Delete (hard delete, behind an inline
  confirm step).
- **System → Tasks** — system automations. Read-only **except Run Now** — the one operator action
  permitted on a system task (schedule, last run, next run, run history, plus on-demand execution).
  Makes system health observable and operable without console access.

The verb model today is Run Now / Disable / Enable / Delete, and an automation's status is `active` or `disabled` (`AutomationStatusSchema` in [`contract/schemas.ts`](ref:path:contract/schemas.ts)). A disabled automation is unscheduled but can still be run with Run Now. Delete is permanent — there is no archive
or restore path; deleting a user automation also removes its run history.

## Run Now feedback

`POST /:id/run` returns 202 once the job is *triggered*, not once it finishes — system jobs and
cross-provider tasks can take real time, so the row can't wait on the response to know the outcome.
Feedback is split into two independent pieces, neither of which involves the domain event bus:

- **Trigger confirmation.** [`AutomationRow`](ref:path:src/components/AutomationRow/index.tsx) tracks
  its own `idle | loading | pass | fail` status per row, reusing the same status-icon vocabulary
  [`ConnectionTestIcon`](ref:path:src/components/ConnectionTestIcon/index.tsx) already established for
  provider connection tests. The Run Now icon swaps to a spinner while the POST is in flight, then a
  check or a cross for ~2s once it settles, before reverting to idle. This confirms the click was
  *received*, not that the underlying job has *finished* — a distinction the row is careful not to
  blur (title text reads "Run triggered", never "Run complete"). The feedback row overrides its
  usual hover-only visibility while non-idle, so it stays visible even after the cursor leaves —
  otherwise a fire-and-click interaction would hide its own confirmation.
- **Eventual list revalidation.** [`useAutomations.run()`](ref:path:src/hooks/useAutomations.ts) fires
  four staggered SWR revalidations (1.5s/4s/9s/18s) after a successful trigger, so `lastRun` catches
  up once the async job actually completes without the user reloading. This is a fixed polling
  schedule, not a push — a job that finishes after the last poll window shows a stale `lastRun` until
  the row's next natural revalidation (e.g. a subsequent visit to the page).

What this does *not* provide: a live "still running" state for the job's actual duration, or any
signal that distinguishes "slow" from "hung." Neither trigger confirmation nor polling involves the
domain event bus — a push-based run-status stream remains unbuilt.
