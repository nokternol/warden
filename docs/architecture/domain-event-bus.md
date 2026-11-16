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
| `run:completed` | `{ automationId, kind, taskId, status, itemCount, error?, finishedAt, runId, ranAt }` | **post-commit**, from `recordResult`, carrying the persisted `runId`/`ranAt` — for success, error and skipped runs (a skipped run is an invalid automation that was not run; `error` carries the reason) |

`run:completed` is emitted post-commit with the real persisted identifiers so a client can apply it
authoritatively without diverging from a later refetch. Both success and failure flow through the
single `recordResult` emit site.

### Data change — **namespaced by scope**

| Event | Payload | Emitted |
|---|---|---|
| `media:changed` | *(none)* | when the catalog refresh or the enrichment job finishes, **success or failure, whatever it changed**; and after a media reset deletes the library copy |
| `provider:changed` | *(none)* | after every [`ProviderSettingsService`](ref:path:server/modules/providers/providerSettingsService.ts) create, update and delete (not `recordTest`, which changes only a provider's test status) |

`media:changed` means *the library copy in Warden's database changed*. Only what writes the copy sends
it: the refresh jobs ([`AutomationExecutor`](ref:path:server/modules/automations/automationExecutor.ts)
sends it in a `finally` around a system job, since a job that fails partway has still rewritten part of
the copy) and a media reset ([`media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts)).
User runs do not send it: a run acts on the services, not on the copy, and the copy changes only when
a refresh reads the services again.

The event name carries the scope, so a future scope gets its own typed event rather than a
discriminator field on a shared one. The payload is **intentionally empty**: the one consumer reloads
the whole copy, so the event need only say *that* it changed.

## The `affects` declaration on actuator tasks

Actuator tasks still carry `affects` on the `ActuatorTaskDescriptor` the `MediaActuator` role declares
([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts), returned by each
provider's `tasks()`): `affects: 'media'` when, by the time `run` returns, the task has changed library
data in the upstream service, and nothing for a task that only starts a background command (search,
refresh, rescan). Nothing reads it today; it is the declaration a refresh-after-action would read to
know which runs are worth a follow-up refresh.
[`actuatorTaskAffects.test.ts`](ref:path:server/__tests__/modules/providers/actuatorTaskAffects.test.ts)
pins the exact set of tasks that leave it off, so a new task fails it until someone applies the rule.

## Producers & consumers

- **Producers:** `AutomationExecutor.execute()` (for system refresh jobs) and the media reset send
  `media:changed`; `ProviderSettingsService` sends `provider:changed`.
- **Consumers:**
  - [`LibraryCache`](ref:path:server/modules/media/libraryCache.ts) drops its loaded copy on both events,
    and loads again on the next read.
  - [`ActiveFieldSetCache`](ref:path:server/modules/media/activeFieldSet.ts) drops its cached field set on `provider:changed`.

`EventEmitter.emit` is synchronous and re-throws a listener's exception into the sender. The bus
doesn't isolate listeners from each other or from the sender; each in-process listener catches its
own errors instead. Bus-level isolation becomes worth building when per-connection SSE consumers
attach.

## Cache invalidation conventions

The event bus is the only route by which a cache over Warden's own data clears. Neither cache has a
time-based expiry: the library copy changes only when a refresh writes it.

| Route | Fires when | Covers |
|---|---|---|
| `media:changed` | A refresh job finished, or a media reset deleted the copy | The library copy in the database changed |
| `provider:changed` | `ProviderSettingsService` create, update or delete | Which providers' copies are active, and which fields can be supplied |

Both caches guard against an in-flight load: `LibraryCache` stores the promise of the load it starts and a
clear drops it, so a load that started before an invalidation is never kept; `ActiveFieldSetCache`
keeps a generation counter.

### When something sends `provider:changed`

Every provider-settings mutation that can change which providers are active or what they serve.

### Listener rules

- **Catch your own errors.** A throw re-enters the sender: it would record a run twice, or fail a
  provider save after the row was written.
- **Subscribe once if long-lived; `off` if built per request or per test.** A listener per request
  leaks, and Node warns past ten listeners on one event.
- **Delivery is synchronous.** A listener runs before `emit` returns, so a provider save has cleared
  the caches before it responds ([`eventBus.test.ts`](ref:path:server/__tests__/kernel/eventBus.test.ts)).

### Adding a cache

Prefer reading the library cache. A cache of anything else says in a comment which route clears it.
