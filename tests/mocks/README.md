# Test Mocks

MSW (Mock Service Worker) handlers for API mocking.

## Purpose

Provide shared API mocks for all test frameworks:
- Vitest (unit tests)
- Cypress (E2E tests)
- Ladle (component stories)

## Structure

```
mocks/
  handlers/       # API mock handlers by domain
    index.ts      # Combined handlers array
    auth.ts       # Auth endpoint mocks
    backdrops.ts  # Backdrop endpoint mocks
    radarr.ts     # Radarr API mocks (outbound)
    sonarr.ts     # Sonarr API mocks (outbound)
    tautulli.ts   # Tautulli API mocks (outbound)
    jellyfin.ts   # Jellyfin API mocks (outbound)
    overseerr.ts  # Overseerr & Seerr API mocks (outbound)
  browser.ts      # MSW browser worker (Cypress, Ladle)
  server.ts       # MSW Node server (Vitest — both client and server tests)
```

## Creating Handlers

Warden's own API is mocked from the API contract with `mockProcedure` (`tests/mocks/contract.ts`): the
handler answers at the procedure's own method and path, inside the `{ status: 'ok', data }` envelope,
and the resolver is typed as the procedure's output, so a mock that drifts from the contract fails to
compile. No mock writes an `/api/...` URL.

```typescript
// tests/mocks/handlers/automations.ts
import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

export const automationsHandlers = [
  mockProcedure(contract.automations.list, () => MOCK_AUTOMATIONS),
  mockProcedure(contract.automations.run, () => null),
];
```

External systems (Radarr, Plex, plex.tv, …) are not in the contract and are mocked with plain
`http.get(...)` handlers.

## Overriding Mocks

Override handlers per test the same way. For a response the contract can't express (a raw 500 or a
proxy error page), use `contractPath(procedure)` for the URL:

```typescript
import { contract } from '@contract/index';
import { contractPath, mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';

it('surfaces a failure', async () => {
  server.use(
    http.get(contractPath(contract.providers.tasks), () => new HttpResponse(null, { status: 500 }))
  );
  // …
});
```

## Test Framework Setup

MSW is initialized in two places depending on the test environment:

| Setup file | Environment | Purpose |
|---|---|---|
| `tests/setup/vitest.ts` | `happy-dom` (client tests) | Starts MSW browser worker; intercepts requests made by client-side React code |
| `tests/setup/vitest.server.ts` | `node` (server tests) | Starts MSW node server; intercepts **outbound** `fetch`/`ky` calls made by server-side services to external APIs (Radarr, Sonarr, etc.) |

The `vitest.server.ts` setup uses `onUnhandledRequest: 'warn'` so service tests that fire unexpected requests produce a console warning rather than failing the suite.

Both setup files call `server.resetHandlers()` in `afterEach` so per-test overrides don't leak.

See [../TESTING.md](../../TESTING.md) for architecture details.
