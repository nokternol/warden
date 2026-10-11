# System Health Check

## What it is

A named, discrete step in the Warden startup sequence that asserts system invariants and
self-heals recoverable conditions before the scheduler and route tree are mounted.

Warden is Docker-first. Containers restart. The health check ensures the system reaches a
valid state without manual intervention.

## Startup sequence

```
initializeDatabase()
  → systemHealthCheck(db)
    → ensureSystemJobs(db)   — upserts missing system automations
    → (future checks)
  → buildContainer(...)
  → automationService.listActive() + automationScheduler.schedule(a) per automation (seed loop)
  → server.listen()
```

## Failure classification

### Critical — triggers Failed-State UI
The system cannot serve a useful session. The Express app mounts a no-auth error page
instead of the normal route tree. The server always binds — what it serves depends on state.

Examples:
- Database cannot initialise or migrations fail
- SESSION_SECRET or equivalent required config absent

The failed-state UI:
- Requires no authentication
- Shows WHY the system is down in plain language
- Shows actionable remediation steps
- Is served by the same Express process (not a separate server)
- Intercepts all routes via a single middleware registered before the normal route tree

### Recoverable — self-heals silently
The system can reach a valid operational state on its own.

Examples:
- System automations missing from DB → upsert them, continue
- (future) schema drift → apply pending migrations

### Warning — boot normally, surface in UI
The system is fully operational but under-configured.

Examples:
- No source configured → the Automations page leads with the [setup checklist](ref:path:src/components/SetupChecklist/index.tsx)
- A configured provider is unreachable → provider shown as disconnected in settings

## Rule

**Critical = the system cannot serve a useful session to any user.**
Recoverable = operational in a degraded but useful state.
Warning = fully operational, under-configured.

## Location

[`server/modules/system/systemHealthCheck.ts`](ref:path:server/modules/system/systemHealthCheck.ts) — exported as a single async function called from
[`server/index.ts`](ref:path:server/index.ts) after `initializeDatabase()`. Each check is a named assertion. Critical failures
throw. Recoverable conditions are fixed in place. Warnings are logged.

## Why

A system that boots a helpful error page is more operable than one that crashes silently or
requires console access to diagnose. This is especially important for self-hosted Docker
deployments where the operator may not have easy terminal access.
