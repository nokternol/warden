# Middleware

Express middleware that forms the request pipeline. Every request flows through these in order.

## Middleware Ordering

The order in `server/index.ts` matters. Current pipeline:

```
1. helmet          — Security headers
2. cors            — CORS handling
3. express.json()  — Body parsing
4. requestId       — Assigns req.requestId (must be before logger)
5. requestLogger   — Starts timer, logs on response finish
6. [routes]        — /api (checkUser + the API contract via serveApi) + Next.js catch-all
7. errorHandler    — Catches thrown errors (MUST be last)
```

**Why this order:** The request ID must exist before anything logs. The error handler must be last because Express only routes to 4-argument middleware (`err, req, res, next`) when `next(err)` is called or an error is thrown.

## How Errors Flow

API procedures don't reach this handler: `serveApi` (`server/kernel/api.ts`) turns an error a procedure
throws into the same `{ status: 'error', error: { type, message } }` envelope with its status. The error
handler covers everything else Express runs (body parsing, session, the Next.js catch-all):

1. Middleware throws an `AppError` subclass (or any `Error`), or calls `next(err)`.
2. Express skips all remaining middleware and jumps to `errorHandlerMiddleware`.
3. The error handler logs with `requestId`, then returns a structured `ApiErrorResponse`.

## Adding New Middleware

1. Create a new file in `server/middleware/`.
2. Export a function with the Express middleware signature: `(req, res, next) => void`.
3. Add the export to `server/middleware/index.ts`.
4. Register it in `server/index.ts` at the correct position in the pipeline.
5. Add tests in `server/__tests__/middleware/` using `supertest` and `createTestApp()`.

## Testing Middleware

Middleware tests use a lightweight Express app built with `createTestApp()` from `tests/helpers/`:

```typescript
import request from 'supertest';
import { createTestApp, withErrorHandler } from '@tests/helpers/createTestApp';

const app = createTestApp();
app.get('/test', (_req, res) => res.json({ ok: true }));
withErrorHandler(app);

const response = await request(app).get('/test');
expect(response.status).toBe(200);
```
