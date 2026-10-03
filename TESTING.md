# Testing Architecture

## MSW Architecture

**Core Principle**: MSW (Mock Service Worker) is **NEVER** imported or managed by application code. Each test framework is responsible for initializing and shutting down its own MSW worker.

### MSW Initialization by Framework

```
Application Code (src/, server/)
    ↓ NO MSW IMPORTS

Test Frameworks Initialize MSW:
├── Vitest        → tests/setup/vitest.ts initializes MSW server
├── Cypress       → cypress/support/e2e.ts initializes MSW worker
└── Ladle         → .ladle/components.tsx initializes MSW worker
```

### Shared Mock Handlers

All test frameworks share the same HTTP handlers:
- **Location**: `tests/mocks/handlers/`
- **Usage**: Imported by each framework's setup file
- **Benefit**: Single source of truth for all mocked APIs

```typescript
// tests/mocks/handlers/auth.ts — typed against the API contract
export const authHandlers = [
  mockProcedure(contract.auth.me, () => MOCK_USER),
];
```

## Testing Stack

### Unit Tests (Vitest)
- **Location**: `__tests__/` folders colocated with source
- **Run**: `yarn test` or `yarn test:run`
- **MSW**: Initialized in `tests/setup/vitest.ts`

```bash
yarn test              # Watch mode
yarn test:run          # Run once
yarn test:ui           # Open UI
yarn test:coverage     # With coverage
```

### E2E Tests (Cypress)
- **Location**: `cypress/e2e/`
- **Run**: `yarn test:e2e` (interactive) or `yarn test:e2e:headless`
- **MSW**: Can be initialized in `cypress/support/e2e.ts` (optional)

```bash
yarn test:e2e          # Interactive mode
yarn test:e2e:headless # Headless mode
yarn test:e2e:ci       # With server start/stop
```

**Note**: Cypress requires system dependencies in Linux/WSL:
```bash
# Ubuntu/Debian
sudo apt-get install libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev \
  libgconf-2-4 libnss3 libxss1 libasound2 libxtst6 xauth xvfb google-chrome-stable
```

### Component Stories (Ladle)
- **Location**: `*.stories.tsx` colocated with components
- **Run**: `yarn ladle`
- **MSW**: Initialized in `.ladle/components.tsx`

```bash
yarn ladle             # Serve stories
yarn ladle:build       # Build static site
```

## GOD SCRIPTS

Single commands that run all checks:

### `yarn verify` (Full)
Runs everything with auto-fixes:
1. `biome check --write` - Lint & format with safe fixes
2. `yarn typecheck` - TypeScript check (client + server)
3. `yarn test:run` - Vitest unit tests
4. `yarn test:e2e:ci` - Cypress E2E tests (starts server automatically)

```bash
yarn verify
```

### `yarn verify:fast` (Without E2E)
Same as above but skips Cypress (for environments without system deps):
1. `biome check --write` - Lint & format
2. `yarn typecheck` - TypeScript check
3. `yarn test:run` - Vitest unit tests

```bash
yarn verify:fast
```

### `yarn ci` (CI Pipeline)
Same as `verify` but without auto-fixes (fails on lint issues):

```bash
yarn ci              # Full CI with E2E
yarn ci:fast         # CI without E2E
```

## Code Quality

### Biome.js (Linting + Formatting)
Single tool replaces ESLint + Prettier:

```bash
yarn lint            # Check only
yarn lint:fix        # Fix with safe fixes
yarn format          # Format code
yarn format:check    # Check formatting
```

### TypeScript
```bash
yarn typecheck           # Both client + server
yarn typecheck:client    # Client only
yarn typecheck:server    # Server only
```

## Pre-Commit Workflow

Before committing:
```bash
yarn verify:fast
```

This ensures:
- ✅ Code is formatted
- ✅ No lint errors
- ✅ No type errors
- ✅ All unit tests pass

## CI/CD Workflow

In CI pipeline:
```bash
yarn ci              # With E2E tests
# OR
yarn ci:fast         # Without E2E tests (faster)
```

## Server Testing Patterns

### Environment Split

Server and client tests run in different environments:
- **Server tests** (`server/**`): Run in **Node.js** environment
- **Client tests** (`src/**`): Run in **happy-dom** environment

This is configured in `vitest.config.ts` using test projects:

```typescript
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { include: ['server/**'], name: 'server', environment: 'node' } },
      { extends: true, test: { include: ['src/**'], name: 'client', environment: 'happy-dom' } },
    ],
  },
});
```

### Test Helpers

Located in `tests/helpers/`, these utilities provide consistent testing patterns:

#### API Testing (`tests/helpers/api.ts`)

```typescript
import { createApiClient, expectSuccessResponse, expectErrorResponse } from '@tests/helpers/api';

const client = createApiClient(app);

// Make requests
const response = await client.get('/api/health');
const response = await client.post('/api/users', { name: 'John' });

// Assert responses
expectSuccessResponse(response, { id: 1, name: 'John' });
expectErrorResponse(response, 404, 'NOT_FOUND');
expectValidationError(response, { email: ['Required'] });
```

#### Component Testing (`tests/helpers/component.tsx`)

```typescript
import { render, screen, setupUser } from '@tests/helpers/component';

// Render with providers
render(<MyComponent />);

// User interactions
const user = setupUser();
await user.click(screen.getByRole('button'));
await user.type(screen.getByLabelText('Name'), 'John');

// Utilities
await waitForLoadingToFinish();
const element = getByTestId(container, 'my-element');
```

#### Test Factories (`tests/factories/index.ts`)

```typescript
import { generateId, randomEmail, createMockConfig, timestamp } from '@tests/factories';

const user = {
  id: generateId(),
  email: randomEmail(),
  createdAt: timestamp(),
};

const config = createMockConfig({ PORT: 3000 });
```

### Integration Tests

Integration tests demonstrate full application setup:

```typescript
// server/__tests__/integration/health.integration.test.ts
import { createApiClient } from '@tests/helpers/api';
import { createMockConfig } from '@tests/factories';

describe('Health API Integration', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;

  beforeAll(async () => {
    // 1. Load test configuration
    const config = loadConfig();

    // 2. Initialize database (in-memory for tests)
    const dataSource = await initializeDatabase(config);

    // 3. Build DI container
    const container = buildContainer({ config, dataSource });

    // 4. Create Express app with middleware
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(serveApi({ system: createSystemProcedures(container.cradle) }));
    app.use(errorHandlerMiddleware);

    // 5. Create test client
    client = createApiClient(app);
  });

  it('returns health status', async () => {
    const response = await client.get('/api/health');
    const data = expectSuccessResponse(response);

    expect(data).toMatchObject({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });
});
```

### Debugging

#### VS Code Debugger

Run the dev server with debugger attached:

```bash
yarn dev:debug
```

Then attach VS Code debugger (F5) or use "Attach to Node Process" command.

#### Server Test Debugging

Add debugger statements and run specific server tests:

```bash
yarn test server/__tests__/my.test.ts
```

See [TESTING_PATTERNS.md](./TESTING_PATTERNS.md) for comprehensive testing guide.

## Adding New Tests

### 1. Unit Test (Vitest)
```typescript
// src/components/MyComponent/__tests__/MyComponent.test.tsx
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MyComponent from '../index';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### 2. E2E Test (Cypress)
```typescript
// cypress/e2e/my-feature.cy.ts
describe('My Feature', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('works correctly', () => {
    cy.contains('My Feature').should('be.visible');
  });
});
```

### 3. Component Story (Ladle)
```typescript
// src/components/MyComponent/MyComponent.stories.tsx
import type { Story } from '@ladle/react';
import MyComponent from './index';

export const Default: Story = () => <MyComponent />;
export const WithProps: Story = () => <MyComponent variant="primary" />;
```

### 4. MSW Handler
```typescript
// tests/mocks/handlers/my-api.ts — mocks a contract procedure at its own method and path
import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

export const myApiHandlers = [
  mockProcedure(contract.myNamespace.myProcedure, () => MOCK_OUTPUT),
];

// tests/mocks/handlers/index.ts
import { myApiHandlers } from './my-api';
export const handlers = [...authHandlers, ...myApiHandlers];
```

## Architecture Principles

1. **Test Framework Ownership**: Each test framework owns its MSW initialization
2. **No Application Coupling**: Application code never imports MSW
3. **Shared Handlers**: All frameworks use the same mock handlers
4. **Fast Feedback**: God scripts provide instant verification
5. **CI Parity**: Local `verify` matches CI `ci` behavior
