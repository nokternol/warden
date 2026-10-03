# Domain Event Bus

Shipped 2026-06-15 as Phase 2 of the Realtime & Event-Driven Cache plan.

A single in-process, typed event bus that decouples "something happened inside the
scheduler/executor" from "something outside must react." Producers publish; consumers subscribe.
**Single process only** — no Redis / cross-node fan-out (matches the self-hosted, single-operator
deployment). Horizontal scaling is the boundary to revisit.

## The bus

`DomainEventBus` ([`server/kernel/eventBus.ts`](ref:path:server/kernel/eventBus.ts)) wraps a Node `EventEmitter` with a typed event map
(`DomainEvents`). It is registered as a singleton in the awilix cradle ([`server/kernel/container.ts`](ref:path:server/kernel/container.ts),
`eventBus`). `on`/`off`/`emit` are generic over the event-name keys so payloads are checked against
the map at compile time.

## Event catalogue

Two orthogonal families — never conflated, later exposed as two SSE channels (Phases 4 & 5).

### Run lifecycle ("task" family) — fires for **every** run

| Event | Payload | Emitted |
|---|---|---|
| `run:started` | `{ automationId, kind, taskId, startedAt }` | at the top of the run body, after the automation is loaded |
| `run:completed` | `{ automationId, kind, taskId, status, itemCount, error?, finishedAt, runId, ranAt }` | **post-commit**, from `recordResult`, carrying the persisted `runId`/`ranAt` — for both success and error |

`run:completed` is emitted post-commit with the real persisted identifiers so a client can apply it
authoritatively without diverging from a later refetch. Both success and failure flow through the
single `recordResult` emit site.

### Data change — **namespaced by scope**

| Event | Payload | Emitted |
|---|---|---|
| `media:changed` | *(none)* | after a successful run **iff** the producing task declares `affects: 'media'` **and** `itemCount > 0` |

The event name is **derived from the declared scope**: a task declaring `affects: 'media'` emits
`` `${affects}:changed` `` = `media:changed`. A future scope (e.g. `library`) declares
`affects: 'library'` and emits `library:changed` — its own typed event, not a discriminator field on
a shared event. This is the deliberate alternative to a single generic `data:changed` carrying a
`scope` field: the namespace lives in the event name, giving each domain room to deepen its own
payload independently.

The payload is **intentionally empty**. The event drives cache invalidation, and the enrichment cache
it will feed (Phase 3) is whole-scope — so the event need only say *that* media changed, not which
slice. A within-scope discriminator (e.g. `movie`/`series`) is added only if and when a consumer
segments its cache and proves it needs one, expressed in that consumer's own vocabulary. An earlier
iteration carried a provider `sourceType` discriminator; it was removed before shipping because it
conflated *provider* with *media kind* — the wrong axis for a consumer that would actually segment on
kind, not on which provider produced the event.

## How a task declares it changed data — declarative + gated

Scope lives **with the task definition**, so the executor never hard-codes which tasks touch the cache:

- **Actuator tasks** carry `affects` on the `ActuatorTaskDescriptor` the `MediaActuator` role declares
  ([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts), returned by each provider's `tasks()`). Several tasks declare
  `affects: 'media'` (`unmonitorMovie`, `deleteMovieWithFiles`, `deleteMovieKeepFiles`,
  `changeQualityProfile`, and their Sonarr equivalents); `triggerSearch` declares nothing (its async *arr
  search flips `hasFile` out-of-band, so it does not synchronously change the displayed library).
- **System data jobs** declare scope in `SYSTEM_TASKS` ([`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts)): `system:enrichment`,
  `system:identity-resolution` declare `affects: 'media'`.

The gate and emit are unified in one private helper, [`AutomationExecutor`](ref:label:AutomationExecutor)`.emitDataChange(affects,
itemCount)`: it emits `` `${affects}:changed` `` only when `affects` is set and `itemCount > 0`.
The same helper serves both user tasks and system data jobs.

## The gate contract

Emit `media:changed` **iff** the task declares a media scope **and** `itemCount > 0`.

- `itemCount` **must be non-zero whenever cache-relevant data was written** (no false zero — the only
  failure mode that matters; it would leave the cache stale until a TTL backstop). Phase 1 guarantees
  honest counts for system jobs.
- `itemCount` **may over-count**; over-emission causes only safe, scope-level over-eviction.
- Consumers read only the scope (the event name) — never the count's magnitude. Within-scope and
  per-identity/keyed eviction are deferred until a consumer needs them.

## Producers & consumers

- **Producer:** `AutomationExecutor.execute()`. Any future writer of media-relevant data (a
  Tautulli/Plex webhook, a manual re-enrich, a backfill) should emit `media:changed` directly —
  decoupled from run lifecycle so non-run writers invalidate caches too.
- **Consumers:** none yet. `EventEmitter.emit` is synchronous and re-throws a listener's exception into
  the caller, so the bus does not yet isolate a throwing consumer from the producer — real hardening work
  before any consumer attaches, not yet built.
