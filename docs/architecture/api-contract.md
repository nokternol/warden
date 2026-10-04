# The API contract

Warden's HTTP API is declared once, in a top-level `contract/` folder, and both the server and the
client are derived from that declaration. Adding an API feature to one side only is meant to be
impossible: a procedure the server doesn't implement, a client call to a procedure that doesn't exist,
and a mock that drifts from the declared shape all fail to compile, and a procedure that no client code
calls fails the test suite.

## Why it exists

A client and server that each declare the API for themselves drift apart: a route gains a field the
client never reads, a hand-written URL points at a path that moved, a mock keeps answering a shape the
server stopped sending, and nothing fails. The contract makes the API one declaration that both sides
and the mocks are derived from, so a change made on one side only fails to compile, and an import
across the client/server boundary fails the dependency check.

## The mechanism

The contract uses [oRPC](https://orpc.dev) in contract-first mode, with Zod 4 schemas.

- **Declaration.** [`contract/index.ts`](ref:path:contract/index.ts) assembles one namespace per
  domain: `appSettings`, `auth`, `automations`, `media`, `mediaQueries`, `providers` and `system`. Each
  procedure is built from [`base`](ref:path:contract/base.ts) with `route({ method, path })`, `input(…)`
  and `output(…)`, so the method, URL, input and output of every endpoint sit in one place. Shared wire
  schemas, such as automations, media queries, provider instances and the provider type list, live in
  [`contract/schemas.ts`](ref:path:contract/schemas.ts). The folder depends only on `zod` and
  `@orpc/contract`.
- **Wire format.** Procedures are served as plain REST through oRPC's OpenAPI handler at their existing
  `/api/...` paths. A success answers `{status:'ok', data}`; a failure answers
  `{status:'error', error:{type, message, errors?}}` with the HTTP status of the error.
- **Server.** [`server/kernel/api.ts`](ref:path:server/kernel/api.ts) exports `api`, the result of
  `implement(contract)`, which every module builds its procedures from (each module's
  `*.procedures.ts`, such as
  [`automations.procedures.ts`](ref:path:server/modules/automations/automations.procedures.ts)). A
  handler returning the wrong shape doesn't compile. [`createApiRouter`](ref:path:server/modules/index.ts)
  assembles every module's procedures with `api.router(…)`, which checks the assembly against the
  contract, so a procedure no module implements doesn't compile either. `serveApi` mounts a router in
  Express. It wraps validated output in the success envelope and translates errors into the error
  envelope: an `AppError` keeps its status and type (logged as an error at 5xx, a warning below),
  input that fails the contract's schema is a 400 `VALIDATION_ERROR` with field errors (an issue with
  the input as a whole goes in the message), and anything unexpected, including a handler result
  that breaks the contract's output, is a logged 500 `INTERNAL_ERROR`.
  Requests the contract doesn't match fall through to the next Express handler.
- **Authentication.** The implementer's root middleware is default-deny: a procedure answers without a
  signed-in user only when its contract meta says `public: true`. Every other procedure, including one
  added later, is refused with 401 `UNAUTHORIZED`. Only four procedures are public, the ones needed before
  sign-in: `system.health`, `auth.plexLogin`, `auth.logout` and `media.backdrops` (the sign-in page's
  images). [`defaultDenyAuth.integration.test.ts`](ref:path:server/__tests__/integration/defaultDenyAuth.integration.test.ts)
  pins this down. It requires the contract's `public` marks to be exactly that allowlist. With
  `BYPASS_AUTH` off, it also walks the contract against the assembled router: every procedure outside the
  allowlist must refuse an anonymous call, and none on it may be refused by the guard. Adding a public procedure
  is therefore a reviewed change to that test. The procedure context carries the user that
  `checkUser` attached from the session, and the session itself, which sign-in starts and sign-out
  destroys.
- **Owner-only sign-in.** `auth.plexLogin` is public, but only one Plex account may use it: the
  instance's owner, its one user row. The first sign-in on an instance with no user claims it, in a
  single conditional insert so two first sign-ins cannot both succeed. Every later sign-in must be that
  account. It is matched by Plex id, and by email only while the stored row has no Plex id yet. Any other
  account is refused with 403 `FORBIDDEN` and a reason, and no user row or session is created for it
  ([`authService.ts`](ref:path:server/modules/auth/authService.ts)). The login page classifies a 403 as a
  refusal ([`index.page.tsx`](ref:path:src/pages/login/index.page.tsx)) and shows the server's reason as a
  "Sign-in refused" state, distinct from a generic failure
  ([`LoginScreen.tsx`](ref:path:src/pages/login/LoginScreen.tsx)).
- **Auth bypass (development only).** With `BYPASS_AUTH=true`, `serveApi` marks every request's context
  `authBypassed`, and the root middleware lets non-public procedures answer without a user. This is what
  lets browser tooling such as `playwright-cli` drive the app without a Plex sign-in; `requireAuth`
  skips the page redirect under the same variable. Config validation refuses to start with it on in
  production, and the server logs a warning at startup whenever it is on.
- **Client.** [`src/lib/api/client.ts`](ref:path:src/lib/api/client.ts) exports `api`, a client typed
  from the contract. Calling a procedure that doesn't exist, or passing input it doesn't accept, doesn't
  compile, and no caller writes a URL. The client unwraps the success envelope, turns the error envelope
  into an `ORPCError` that carries the server's type, message, status and any field errors (`data.errors`), and validates every payload
  against the procedure's output schema, so drifted data is an error rather than silently wrong.
  `createApiClient({ url, headers })` builds the same client for another origin; server-side rendering
  uses it with the caller's cookie. Each procedure is bound once to a stable function, so
  [`useApi(procedure, input)`](ref:path:src/lib/api/useApi.ts) can key SWR by procedure and input. It is
  the one generic hook that the domain hooks are built on, and a `null` input defers the fetch.
- **Mocks.** [`mockProcedure(contract.<ns>.<procedure>, resolver)`](ref:path:tests/mocks/contract.ts)
  registers an MSW handler at the procedure's own method and path, answering inside the success
  envelope. The resolver is typed as the procedure's output, so a mock that drifts doesn't compile.

## Provider records pass through

Media browse rows and provider lookup entries are Radarr and Sonarr records. Their contract schemas
([`contract/media.ts`](ref:path:contract/media.ts)) declare the fields the client reads and let the rest
of the provider's record through unchanged (`z.looseObject`), so responses keep every field the
provider sent. A loose schema only accepts implicitly indexable types, so the provider record shapes in
[`radarrProvider.ts`](ref:path:server/modules/providers/connections/radarrProvider.ts) and
[`sonarrProvider.ts`](ref:path:server/modules/providers/connections/sonarrProvider.ts) are type aliases
rather than interfaces.

## Where the contract declares a server enum

The contract can't import the server, so it declares the provider type list itself. Server code that
reads a type from a request checks at compile time that the contract's list equals
`MetadataProviderType`'s values, in
[`providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts).

## Structured values on a GET

oRPC's OpenAPI link sends a GET's input as bracket-notation query params, and every value arrives at
the server as a string. That is fine for a page number the input schema coerces, but not for a value
whose type matters, such as a `Filter` whose `value` may be a boolean, a number, a `{ min, max }` range
or an `{ providerId, ids }` object. Such a value travels as one JSON query param instead: `jsonQuery`
in [`contract/media.ts`](ref:path:contract/media.ts) parses the string and pipes it into the schema the
value would have anywhere else.

Browse is the case that needs it. `media.browse.movie` and `media.browse.series` answer
`GET /api/media/{movie|series}` and take `filters` as JSON holding the same `FilterSchema` entries a
saved query stores, so browse and save share one filter encoding, validated by one schema. A `filters`
value that is not JSON, or not an array of `Filter` entries, answers 400 rather than browsing
unfiltered. [`usePaginatedMedia`](ref:path:src/hooks/usePaginatedMedia.ts) is the one client place that
encodes it.

## What enforces it

- **Compile-time fixtures.** [`server/__tests__/fixtures/contractCompile.ts`](ref:path:server/__tests__/fixtures/contractCompile.ts)
  and [`src/lib/api/__tests__/contractCompile.fixture.ts`](ref:path:src/lib/api/__tests__/contractCompile.fixture.ts)
  hold `@ts-expect-error` lines proving that a missing handler, a wrong handler output, an unknown
  client call and wrong client input all fail `yarn typecheck`. Each line also fails the typecheck if
  it ever starts compiling.
- **No server-only features.** [`procedureCoverage.test.ts`](ref:path:src/__tests__/contract/procedureCoverage.test.ts)
  requires every contract procedure to be called somewhere in `src/`, outside tests and stories. Its
  explicit allowlist names the procedures no client calls, each with a reason: `system.health`, which
  the container health check probes, and the deferred `appSettings.get`, `appSettings.update` and
  `providers.metadata`, which have no client consumer yet.
- **Direction.** [`.dependency-cruiser.cjs`](ref:path:.dependency-cruiser.cjs) forbids `src/` importing
  `server/`, `server/` importing `src/` (type-only imports included), and `contract/` importing either.
  [`boundaries.test.ts`](ref:path:server/__tests__/boundaries.test.ts) cruises a fixture tree with the
  same rule set to prove each rule fires. `yarn depcruise:ci` checks `src/`, `server/` and `contract/`.

## Module resolution

oRPC ships ES modules whose types are exposed only through package `exports`. The client tsconfig
resolves modules as a bundler. The server tsconfig uses `node20`/`node16` resolution and still emits
CommonJS, which Node 24 loads through `require` of ES modules.
