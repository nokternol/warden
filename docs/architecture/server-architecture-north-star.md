# Server architecture North Star — full DDD feature modules

This is the design every server-side file now lives under. The
server used to run three competing designs at once for "where does feature logic live" — a boilerplate
"clean architecture" the READMEs used to describe, a transport-modules + flat-services split, and the
domain-module ambition `server/modules/README.md` always hinted at (see the fracture ledger's now-Healed
"Server layering" entry, [`docs/architecture/fracture-ledger.md`](ref:path:docs/architecture/fracture-ledger.md),
for the history of how it converged). This doc describes the one design that won.

## The design

**Feature modules own everything for their domain** — their API procedures, services, domain
logic, and jobs. There is no flat `server/services/` layer; every service lives inside the module that
owns it. A module is a vertical slice of the product, not an HTTP surface.

**Sharing model: public-API imports + a small kernel.**

- Each module exposes a **deliberately crafted public interface** via its `index.ts`
  ([`providers/index.ts`](ref:path:server/modules/providers/index.ts),
  [`media/index.ts`](ref:path:server/modules/media/index.ts),
  [`mediaQueries/index.ts`](ref:path:server/modules/mediaQueries/index.ts),
  [`automations/index.ts`](ref:path:server/modules/automations/index.ts),
  [`auth/index.ts`](ref:path:server/modules/auth/index.ts),
  [`system/index.ts`](ref:path:server/modules/system/index.ts),
  [`settings/index.ts`](ref:path:server/modules/settings/index.ts)). This is *not* a barrel file — it
  never wholesale re-exports the module's internals. It exports the minimal, intentionally designed
  surface other modules and the HTTP layer consume: the types, functions, and services that form the
  module's contract, chosen one by one. Anything not exported is private, and a growing export list is a
  design smell to challenge, not a convenience.
- A small [`server/kernel/`](ref:path:server/kernel/container.ts) holds true infrastructure with no
  domain meaning: the event bus ([`eventBus.ts`](ref:path:server/kernel/eventBus.ts)), logger
  ([`logger.ts`](ref:path:server/kernel/logger.ts)), config ([`config.ts`](ref:path:server/kernel/config.ts),
  [`env.ts`](ref:path:server/kernel/env.ts)), database handle
  ([`db.ts`](ref:path:server/kernel/db.ts)), error hierarchy
  ([`errors.ts`](ref:path:server/kernel/errors.ts)), a generic TTL cache
  ([`cache.ts`](ref:path:server/kernel/cache.ts)), middleware
  ([`middleware/`](ref:path:server/kernel/middleware/index.ts)), and the API contract implementer
  ([`api.ts`](ref:path:server/kernel/api.ts)), which serves the top-level `contract/` that the client
  shares. Every module may depend on the kernel; the kernel depends on no module.
- **The container splits into mechanism, registrations, and assembly.** Every module owns a
  `<module>.registrations.ts` beside its `index.ts`, exporting a `<Module>Cradle` interface (the slice
  of the app cradle the module contributes) and a `register<Module>Dependencies(container)` function
  (the `asClass`/`asValue` bindings for that slice) —
  [`providers.registrations.ts`](ref:path:server/modules/providers/providers.registrations.ts) is the
  template every other module followed.
  [`server/kernel/container.ts`](ref:path:server/kernel/container.ts) is the mechanism: it registers
  only the kernel's own dependencies (`config`, `db`, `eventBus`) with no domain meaning.
  [`server/container.ts`](ref:path:server/container.ts) is assembly: it composes `Cradle` from
  `KernelCradle` and every module's `<Module>Cradle`, calls `createKernelContainer()` then each module's
  `register<Module>Dependencies()`, and owns nothing domain-specific itself — its inline registration
  block is empty; every `Cradle` entry comes from a kernel or module registrations file.
- No event-driven ceremony for synchronous flows: when automations needs to evaluate media rules, it
  imports the media module's public API directly. The event bus is for genuinely asynchronous domain
  events, not a mandatory indirection.

**Dependency direction follows the product loop** (providers unlock metadata → predicates → queries →
automations): `automations → media, mediaQueries, providers`; `mediaQueries → media, providers`;
`media → providers`; `auth → providers`; `settings → providers`; everyone → `kernel`; `system` and
`providers` import no other module; `kernel` imports no module. Cycles between module interfaces are
design errors. This graph is mechanically enforced — see "Enforcement" below — so it cannot silently
drift from what's written here.

One narrow, sanctioned exception to the direction graph: `providers/identityJobFactory.ts` and
`media/enrichmentJobFactory.ts` each `import type` an interface (`IdentityJobFactoryLike`,
`EnrichmentJobFactoryLike`) from [`system/systemTaskRunner.ts`](ref:path:server/modules/system/systemTaskRunner.ts)
— dependency inversion: `system`'s dispatcher declares the minimal interface it needs to run a job as a
system task, and the module that owns the concrete job factory implements it, importing only the type.
No value ever crosses from `system` into `providers` or `media`; the enforcement config treats
type-only edges as exempt from the direction rule for exactly this pattern, and a new type-only reverse
edge elsewhere is still worth a second look even though the tool won't flag it.

**`media → providers` is now the plain, exception-free default direction.** Earlier in this program,
providers' role contracts (`MediaSource`, `MediaEnricher`) referenced media's `MediaItem` type directly,
which was a deliberate but narrow `providers → media` exception — a role contract has to name the shape
it operates on. That exception no longer exists: `MediaSource` and `MediaEnricher` are now **media-owned**
role contracts ([`media/mediaSource.ts`](ref:path:server/modules/media/mediaSource.ts),
[`media/enrichment/enricher.ts`](ref:path:server/modules/media/enrichment/enricher.ts)). Provider
connection classes (`RadarrProvider`, `SonarrProvider`, `PlexProvider`, `TautulliProvider`,
`OverseerrProvider`, `TmdbProvider`) implement nothing directly — they are *bound* to these roles by
media-owned adapters ([`sourceAdapters.ts`](ref:path:server/modules/media/sourceAdapters.ts),
[`enrichment/enricherAdapters.ts`](ref:path:server/modules/media/enrichment/enricherAdapters.ts)) that
import the provider connection classes from providers' public interface — ordinary `media → providers`,
ordinary direction, no exception. The enrichment mechanics that only need providers' own DTO vocabulary
(the per-provider mappers and the match-and-decorate join) moved with the adapters into
[`media/enrichment/`](ref:path:server/modules/media/enrichment/decorate.ts), typed as `Pick<MediaItem, ...>`
subsets of media's canonical shape.

`MediaActuator` is unaffected by this and stays **provider-owned**, in
[`providers/roles.ts`](ref:path:server/modules/providers/roles.ts) — it is the role providers expose for
actions on media they own, not a role media consumes, so it never had a reason to move.

## Module inventory

```
server/
  kernel/          # eventBus, logger, config, db, errors, cache, middleware, api (contract implementer)
  modules/
    providers/     # connections (BaseProviderConnection + per-system), roles (MediaActuator),
                   # provider settings service, task enablement, identity-resolution job
    media/         # normalize + NormalizedMovie/NormalizedShow shapes, filterRegistry,
                   # MediaSource/MediaEnricher role contracts + their provider adapters,
                   # mediaQueryEngine, enrichment job + merge, backdrops, search
    mediaQueries/  # MediaQueryRecord CRUD + query health
    automations/   # automation service, executor, run service, combinationEvaluator,
                   # scheduler
    auth/          # authService, session store (drizzleStore)
    system/        # health endpoints, systemHealthCheck, ensureSystemJobs,
                   # systemTaskRunner, failedStateMiddleware
    settings/      # transport-only — no domain logic of its own
```

Boundary decisions this inventory encodes:

- **`filterFields`, `backdrops`, `search` are media concerns**, not modules — they were separate only
  because module boundaries used to be drawn by HTTP route, not by domain aggregate.
- **`mediaQueries` stays its own module** (not folded into media, and never grouped with automations):
  it owns the *construction* of filters over enriched source data — `MediaQueryRecord` CRUD,
  filter-value persistence, query health — which is enough logic to live on its own. Automations *use*
  media queries but their logic is separate: the join is database entities
  (`automation_query_sources` relates an automation to the queries it runs against) plus the
  mediaQueries public interface — automations never reach into query internals.
- **Both `health` homes merged into `system`.** HTTP liveness and system self-healing
  (`ensureSystemJobs`, `failedStateMiddleware`) were two different processes sharing one name; `system`
  now owns both.
- **`filterRegistry` lives in media**, not a shared `utils/` — the single authority for the rule
  vocabulary is media-module domain logic.
- **`server/cron/`, `server/jobs/`, `server/domain/`, `server/health/`, `server/services/`, and
  `server/utils/` are all gone.** Every file that used to live in one of them now lives inside the
  module that owns its domain.

## What does not change

- Awilix cradle injection is the part of the design that already worked and stayed as-is. The HTTP
  transport inside a module has since become a single `<module>.procedures.ts` implementing the
  module's part of the top-level API contract (`contract/`), replacing the earlier schemas / handlers /
  routes trio.
- Server-side authority principles already won by healed fractures stay won: registries project
  descriptors, roles own their tasks, the client derives and never re-declares.

## Enforcement

The direction graph and the module-privacy rule above are not just prose — a repo-root
`.dependency-cruiser.cjs` config encodes both as CI-enforced rules
(`yarn depcruise:ci`, wired into `.github/workflows/quality-gate.yml`
alongside `lint:ci`/`typecheck`/`test:run`): nothing outside a module may import a file inside it other
than its `index.ts`, and cross-module imports are restricted to the edges declared above. A module
omitted from another's allow-list is forbidden as a target by default. The same config also forbids
`server/` and `src/` from importing each other and `contract/` from importing either. This is the mechanism that keeps
this doc's "current fact" status honest going forward — read the config and this doc as one design
stated twice, once for humans and once for CI; a future direction change updates both in the same PR.
The fracture ledger's "Server layering" entry (now Healed) is the historical record of how this design
was reached.
