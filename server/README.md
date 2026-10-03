# Server

Express + Drizzle (libSQL/SQLite) backend for Warden. Organized for debugging, logging, and testing
first: fail-fast startup, request-scoped logging with trace ids, standardized errors, Awilix dependency
injection.

## Directory map

```
server/
  container.ts       # Awilix DI container with typed Cradle — buildContainer()
  index.ts           # Entry point and startup sequence
  kernel/            # Infrastructure with no domain meaning — the only home for it:
                     #   config (Zod-validated env), env, errors (AppError hierarchy),
                     #   logger (getChildLogger), eventBus, api (contract implementer),
                     #   middleware/ (requestId → requestLogger → … → errorHandler),
                     #   db (re-exports the DrizzleDb handle contract)
  database/          # Drizzle schema, migrations (session store moved to modules/auth/)
  modules/           # Feature modules: each implements its API contract procedures and owns its
                     #   domain logic behind a crafted public interface (index.ts) — settings/ is
                     #   the one transport-only module (no domain logic of its own)
  types/             # Shared types and Express augmentations
  __tests__/         # Server unit + integration tests
```

## Core patterns

- **Fail-fast initialization.** Startup systems pair an initializer with a guarded accessor:
  `loadConfig()`/`getConfig()`, `initializeDatabase()`/`getDb()`. Initialization failure crashes the
  process; access before initialization throws. No silent fallbacks.
- **Child loggers.** Every module logs through `getChildLogger('Label')`; pass `requestId` in metadata
  to trace one request across subsystems.
- **Request lifecycle.** `requestId` → `requestLogger` → body parser → session → `checkUser` →
  `serveApi` (the contract procedure: input validation, default-deny auth, business logic via injected
  services, output validation, envelope) → `errorHandler` last for anything outside the API.
- **Error propagation.** Procedures and services throw `AppError` subclasses; `serveApi` maps them to
  structured JSON (`{ status: 'error', error: { type, message } }`). Unknown errors return
  a generic message in production.
- **Dependency injection.** `buildContainer()` registers services on a typed `Cradle`; procedure
  factories receive dependencies by destructuring — no global accessors inside request code.

## Where things are documented

- [database/README.md](database/README.md) — Drizzle setup, schema, migrations
- [modules/README.md](modules/README.md) — how modules implement API contract procedures, plus
  module-owned domain logic and container registration conventions
- [../docs/architecture/server-architecture-north-star.md](../docs/architecture/server-architecture-north-star.md)
  — the target design this layout implements: module boundaries, the dependency direction graph, and the
  dependency-cruiser check that enforces both
- `docs/architecture/` — the product model (`warden-core-model.md`), settled names (`VOCABULARY.md`),
  and the fracture ledger; read these before feature work
- [TESTING.md](../TESTING.md) — testing architecture

## Debugging

- `yarn dev:debug` starts the server with the inspector; attach from VS Code.
- `LOG_LEVEL=debug yarn dev` for verbose logs; filter by label: `yarn dev | grep '\[MediaQueryService\]'`.
