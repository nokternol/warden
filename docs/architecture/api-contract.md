# The API contract

Warden's HTTP API is declared once, in a top-level `contract/` folder, and both the server and the
client are derived from that declaration. Adding an API feature to one side only is meant to be
impossible: a procedure the server doesn't implement, a client call to a procedure that doesn't exist,
and a mock that drifts from the declared shape all fail to compile, and a procedure that no client code
calls fails the test suite.

## Why it exists

Before this, the bridge between client and server was partial. Express routes were built with a
`defineRoute` helper, but fewer than half declared a response schema and the schemas they shared lived
in `src/`, so `server/` imported client code. The client wrote every `/api/...` URL by hand in a dozen
local SWR fetchers, each casting `json.data` to whatever type it expected. MSW mocks were a third
hand-kept copy of every response. Nothing failed when one side changed alone, and the
`/api/filter-fields` route even answered without the envelope every other route used.

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
  envelope: an `AppError` keeps its status and type, input that fails the contract's schema is a 400
  `VALIDATION_ERROR` with field errors, and anything unexpected is a logged 500 `INTERNAL_ERROR`.
  Requests the contract doesn't match fall through to the next Express handler.
- **Authentication.** The implementer's root middleware is default-deny: a procedure answers without a
  signed-in user only when its contract meta says `public: true`. Today the public procedures are
  health, sign-in, sign-out, login backdrops, the rule descriptors and the provider capability
  procedures (tasks, task options, metadata, ratings). The procedure context carries the user that
  `checkUser` attached from the session, and the session itself, which sign-in starts and sign-out
  destroys.
- **Auth bypass (development only).** With `BYPASS_AUTH=true`, `serveApi` marks every request's context
  `authBypassed`, and the root middleware lets non-public procedures answer without a user. This is what
  lets browser tooling such as `playwright-cli` drive the app without a Plex sign-in; `requireAuth`
  skips the page redirect under the same variable. Config validation refuses to start with it on in
  production, and the server logs a warning at startup whenever it is on.
- **Client.** [`src/lib/api/client.ts`](ref:path:src/lib/api/client.ts) exports `api`, a client typed
  from the contract. Calling a procedure that doesn't exist, or passing input it doesn't accept, doesn't
  compile, and no caller writes a URL. The client unwraps the success envelope, turns the error envelope
  into an `ORPCError` that carries the server's type, message and status, and validates every payload
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
[`providers.procedures.ts`](ref:path:server/modules/providers/providers.procedures.ts). Likewise
[`contract/browseRangeKeys.ts`](ref:path:contract/browseRangeKeys.ts) is checked against `MEDIA_RULES`
in `filterRegistry.ts`.

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
