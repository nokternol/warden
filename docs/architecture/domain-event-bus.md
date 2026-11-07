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
| `media:changed` | *(none)* | once an actuator task declaring `affects: 'media'` has acted on at least one item, **whether or not the run then succeeds**; and after a system data job declaring `affects: 'media'` reports `itemCount > 0` |
| `provider:changed` | *(none)* | after every [`ProviderSettingsService`](ref:path:server/modules/providers/providerSettingsService.ts) create, update and delete (not `recordTest`, which changes only a provider's test status) |

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
  ([`server/modules/providers/roles.ts`](ref:path:server/modules/providers/roles.ts), returned by each provider's `tasks()`), by the rule in
  [Cache invalidation conventions](#cache-invalidation-conventions).
- **System data jobs** declare scope in `SYSTEM_TASKS` ([`automationExecutor.ts`](ref:path:server/modules/automations/automationExecutor.ts)): `system:enrichment`,
  `system:identity-resolution` declare `affects: 'media'`. They write enrichment and identity data,
  which no cache holds yet, so today their event clears caches that don't depend on them; the
  declaration is for the planned enrichment cache.

The gate and emit are unified in one private helper, [`AutomationExecutor`](ref:label:AutomationExecutor)`.emitDataChange(affects,
itemCount)`: it emits `` `${affects}:changed` `` only when `affects` is set and `itemCount > 0`.
The same helper serves both user tasks and system data jobs. For an actuator task it runs in a
`finally` around `task.run`, with `itemCount` the planned target count: a task that fails partway
(Radarr erroring on the 6th of 10 titles) has still changed upstream data, and a failure while
recording the result can't suppress the event.

## The gate contract

Emit `media:changed` **iff** the task declares a media scope **and** `itemCount > 0`.

- `itemCount` **must be non-zero whenever cache-relevant data was written** (no false zero — the only
  failure mode that matters; it would leave the cache stale until a TTL backstop). Phase 1 guarantees
  honest counts for system jobs.
- `itemCount` **may over-count**; over-emission causes only safe, scope-level over-eviction.
- Consumers read only the scope (the event name) — never the count's magnitude. Within-scope and
  per-identity/keyed eviction are deferred until a consumer needs them.

## Producers & consumers

- **Producers:** `AutomationExecutor.execute()` sends `media:changed`; `ProviderSettingsService`
  sends `provider:changed`. Any future writer of media-relevant data (a Tautulli/Plex webhook, a
  manual re-enrich, a backfill) sends `media:changed` directly — decoupled from run lifecycle so
  non-run writers invalidate caches too.
- **Consumers:**
  - The media procedures ([`media.procedures.ts`](ref:path:server/modules/media/media.procedures.ts)) clear every cache they own on both
    `media:changed` and `provider:changed`. `createMediaProcedures` returns `dispose()`, which
    unsubscribes; the composition root builds them once, tests that build them repeatedly dispose.
  - [`ActiveFieldSetCache`](ref:path:server/modules/media/activeFieldSet.ts) drops its cached field set on `provider:changed`.

`EventEmitter.emit` is synchronous and re-throws a listener's exception into the sender. The bus
doesn't isolate listeners from each other or from the sender; each in-process listener catches its
own errors instead. Bus-level isolation becomes worth building when per-connection SSE consumers
attach.

## Cache invalidation conventions

The event bus is the only route by which Warden's own changes clear a cache. The 60s expiry
([`MediaCache`](ref:path:server/kernel/cache.ts)) stays for changes the bus can't see.

### What clears the media caches

| Route | Fires when | Covers |
|---|---|---|
| `media:changed` | An actuator task declaring `affects: 'media'` has acted on at least one item, whether the run then succeeds or fails. Also a system data job that reports changes. | Upstream library data changed by Warden |
| `provider:changed` | `ProviderSettingsService` create, update or delete | A provider's library joining, changing or leaving |
| 60s expiry | Always | Changes Warden can't see: edits made in Radarr's own UI, upstream background commands finishing, an upstream service recovering by itself |

The media procedures' caches clear on both events. `ActiveFieldSetCache`, which has no expiry, clears
on `provider:changed`. Both caches guard against an in-flight fetch: a fetch that started before an
invalidation still answers its own callers but never writes its result back, so the old data can't
reappear (`MediaCache.invalidate` bumps a per-key generation; `ActiveFieldSetCache` keeps one counter).

A failed provider fetch is cached as a partial or empty result until the expiry or a provider edit,
so requests during an outage don't each wait on the dead upstream's timeout
([`media.cache.failuresCached.integration.test.ts`](ref:path:server/__tests__/integration/media.cache.failuresCached.integration.test.ts)).

### When a task declares `affects`

- **Declare `affects: 'media'`** when, by the time `run` returns, the task has changed library data in
  the upstream service: which titles exist, monitored state, files, quality profile, tags, play
  state, collection membership, metadata — anything a media cache holds or browse and the filters show.
- **Leave it off** only when the task changes no library data by the time `run` returns, such as a
  task that starts an upstream background command (search, refresh, rescan) whose effect lands later.
  An event at return would clear the caches before the change exists, so the expiry covers it. This
  is why `triggerSearch` declares nothing: the *arr search flips `hasFile` out-of-band.
- **If unsure, declare it.** Over-eviction costs one refetch; under-eviction leaves the page stale.

[`actuatorTaskAffects.test.ts`](ref:path:server/__tests__/modules/providers/actuatorTaskAffects.test.ts) builds every provider and pins the exact set of tasks
that leave `affects` off, so a new task fails it until someone applies the rule.

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

Put it where its owner's handler clears it (for the media procedures, the cache array), and say in a
comment which route covers each kind of change it holds.
