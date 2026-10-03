# Tests

Shared test infrastructure for Vitest, Cypress, and Ladle.

## Purpose

Provide centralized testing utilities:
- Mock API handlers (MSW)
- Test helpers (render, createApiClient, etc.)
- Test data factories
- Test setup and configuration

## Structure

```
tests/
  helpers/        # Test utility functions (API, component, etc.)
  mocks/          # MSW handlers and server setup
  setup/          # Vitest configuration
  fixtures/       # Test data and fixtures (if needed)
  factories/      # Test data generators
```

## Test Helpers

```typescript
// API testing
import { createApiClient, expectSuccessResponse } from '@tests/helpers/api';

const client = createApiClient(app);
const response = await client.get('/api/health');
expectSuccessResponse(response);

// Component testing
import { render, screen, setupUser } from '@tests/helpers/component';

const user = setupUser();
render(<Button onClick={onClick}>Click</Button>);
await user.click(screen.getByRole('button'));

// Test data
import { generateId, randomEmail, createMockConfig } from '@tests/factories';

const user = { id: generateId(), email: randomEmail() };
```

## MSW Mocking

MSW automatically mocks HTTP requests in client tests:

```typescript
// tests/mocks/handlers/automations.ts — Warden's own API, declared from the contract
import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

export const automationsHandlers = [
  mockProcedure(contract.automations.list, () => MOCK_AUTOMATIONS),
];
```

See [mocks/README.md](mocks/README.md) for details.

## Further Reading

- [helpers/README.md](helpers/README.md) - Test helpers
- [mocks/README.md](mocks/README.md) - MSW setup
- [../TESTING.md](../TESTING.md) - Testing architecture
- [../TESTING_PATTERNS.md](../TESTING_PATTERNS.md) - Testing guide
