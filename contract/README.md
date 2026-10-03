# contract/

The single declaration of Warden's HTTP API. Every procedure is declared here once with
[oRPC](https://orpc.dev)'s contract builder — method, path, input and output — and both sides are
derived from it:

- **Server** (`server/`) implements the contract with `implement(contract)`. A procedure without a
  handler, or a handler returning the wrong shape, fails to compile.
- **Client** (`src/`) calls the API only through a client typed from the contract. A call to a
  procedure that doesn't exist, or with the wrong input, fails to compile.
- **Mocks** (`tests/mocks/`) are declared from contract procedures, so a mock that drifts from the
  contract fails to compile.

This folder depends on `zod` and `@orpc/contract` only. `src/` and `server/` may import it; it imports
neither of them, and they never import each other (enforced by `.dependency-cruiser.cjs`).
