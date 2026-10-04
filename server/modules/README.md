# Modules

Feature modules. Each module owns its part of the API contract's procedures (e.g., media, automations, providers), and — per the target design in `docs/architecture/server-architecture-north-star.md` — its domain logic too, exposed through a deliberately crafted public interface (`index.ts`, never a wholesale re-export). `providers/`, `media/`, `mediaQueries/`, `automations/`, `auth/`, and `system/` have converged: each owns its services/jobs behind its `index.ts` and a `<module>.registrations.ts` (a `<Module>Cradle` + `register<Module>Dependencies()`, composed into `server/container.ts`); everything outside a module imports only its `index.ts`. The module-boundary and direction rules this convergence produced are enforced by `yarn depcruise:ci` (`.dependency-cruiser.cjs`); the fracture ledger's "Server layering" entry (`docs/architecture/fracture-ledger.md`) is the historical record of how it converged.

## Transport: procedures of the API contract

The HTTP API is declared once in the top-level `contract/` folder (oRPC, contract-first; see
`docs/architecture/api-contract.md`). A module's transport is a single `<module>.procedures.ts` that
implements its procedures with the kernel's implementer, `api` (`server/kernel/api.ts`):

```typescript
// server/modules/mediaQueries/mediaQueries.procedures.ts
import { api } from '@server/kernel/api';
import type { MediaQueryService } from './mediaQueryService';

export function createMediaQueryProcedures({ mediaQueryService }: { mediaQueryService: MediaQueryService }) {
  return api.mediaQueries.router({
    list: api.mediaQueries.list.handler(async () => mediaQueryService.list()),
    delete: api.mediaQueries.delete.handler(async ({ input }) => {
      await mediaQueryService.delete(input.id);
      return null;
    }),
    // …every procedure the contract declares under `mediaQueries`
  });
}
```

**Rules:**
- The contract decides method, path, input and output. A handler receives validated `input` and returns
  the output's shape; returning anything else fails to compile.
- `<ns>.router({...})` requires every procedure of that namespace. A module implementing only part of a
  namespace (media's rules, search and backdrops) returns
  a plain object of procedures, and `server/modules/index.ts` assembles them.
- Handlers return data; `serveApi` wraps it in `{ status: 'ok', data }`.
- Factory pattern: `createXProcedures(cradle)` receives dependencies by destructuring, never via
  `req.scope.resolve()`. The per-request `context` carries `user`, `session` and `requestId`.
- Signed-in is the default: the implementer root refuses a call with no user unless the contract marks
  the procedure `public` in its meta. Don't add per-procedure guards.

## The API router

`server/modules/index.ts`'s `createApiRouter(cradle)` assembles every module's procedures with
`api.router({...})`, which checks the assembly against the contract (a procedure no module implements
fails to compile), and mounts it with `serveApi`. Procedure factories are imported through each module's
crafted `index.ts`.

## Adding a procedure or a module

1. **Declare it on the contract**: add the procedure to its namespace in `contract/<ns>.ts`
   (`base.route({ method, path }).input(…).output(…)`), adding `.meta({ public: true })` only if it must
   answer without a signed-in user.
2. **Implement it**: add the handler to the module's `<module>.procedures.ts`. A new module exports a
   `createYourDomainProcedures(cradle)` from its `index.ts` and is added to `createApiRouter`.
3. **Call it from the client**: `api.<ns>.<procedure>(input)` or `useApi(api.<ns>.<procedure>, input)`.
   A procedure no client code calls fails `procedureCoverage.test.ts` unless allowlisted there with a
   reason.
4. **Add the module's registrations file** (if it owns a service): `yourDomain.registrations.ts`,
   mirroring `providers.registrations.ts` — a `YourDomainCradle` interface and a
   `registerYourDomainDependencies()` function:
   ```typescript
   import { type AwilixContainer, type NameAndRegistrationPair, asClass } from 'awilix';
   import { YourDomainService } from './yourDomainService';

   export interface YourDomainCradle {
     yourDomainService: YourDomainService;
   }

   export function registerYourDomainDependencies<TCradle extends YourDomainCradle>(
     container: AwilixContainer<TCradle>
   ): void {
     const registrations: NameAndRegistrationPair<YourDomainCradle> = {
       yourDomainService: asClass(YourDomainService).scoped(),
     };
     container.register(registrations as NameAndRegistrationPair<TCradle>);
   }
   ```

5. **Export from the module's `index.ts`** and compose into `server/container.ts`'s `Cradle`
   (`extends ... YourDomainCradle`) and `buildContainer()` (`registerYourDomainDependencies(container)`)
   — `server/container.ts` never registers a module's services inline.

## Error Flow

1. **Input fails the contract's schema** → 400 `VALIDATION_ERROR` with field-specific errors
2. **Handler throws an `AppError` subclass** → its status code and type, in the error envelope
3. **Handler throws an unknown error** → 500 `INTERNAL_ERROR` (generic message in production), logged
   with `requestId`
