# Testing Patterns & Best Practices

Guide for writing effective tests in Warden. See [TESTING.md](./TESTING.md) for architecture and setup.

## Test Helpers

### API Testing (`tests/helpers/api.ts`)

Utilities for testing Express APIs with supertest:

```typescript
import { createApiClient, expectSuccessResponse, expectErrorResponse } from '@tests/helpers/api';
import express from 'express';

const app = express();
const client = createApiClient(app);

// Make requests
const response = await client.get('/api/health');
const response = await client.post('/api/users', { name: 'John' });

// Assert responses
expectSuccessResponse(response, { id: 1, name: 'John' });
expectErrorResponse(response, 404, 'NOT_FOUND');
expectValidationError(response, { email: ['Required'] });
```

### Component Testing (`tests/helpers/component.tsx`)

Utilities for testing React components:

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

### Test Factories (`tests/factories/index.ts`)

Generate consistent test data:

```typescript
import {
  generateId,
  randomString,
  randomEmail,
  createMockConfig,
  timestamp,
  createMockError,
} from '@tests/factories';

const user = {
  id: generateId(),
  email: randomEmail(),
  createdAt: timestamp(),
};

const config = createMockConfig({ PORT: 3000 });
```

## Writing Tests

### Component Tests

Test user behavior, not implementation:

```typescript
import { render, screen, setupUser } from '@tests/helpers/component';
import { describe, it, expect } from 'vitest';
import Button from './Button';

describe('Button', () => {
  it('handles clicks', async () => {
    const user = setupUser();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Click me</Button>);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('img', { name: /loading/i })).toBeInTheDocument();
  });

  it('applies variant styles', () => {
    render(<Button variant="danger">Delete</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-danger');
  });
});
```

### API Tests

Test request/response handling:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createApiClient, expectSuccessResponse, expectErrorResponse } from '@tests/helpers/api';
import express, { type Express } from 'express';
import { serveApi } from '@server/kernel/api';
import { createSystemProcedures } from '@server/modules/system';

describe('Health API', () => {
  let app: Express;
  let client: ReturnType<typeof createApiClient>;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(serveApi({ system: createSystemProcedures(mockCradle) }));
    client = createApiClient(app);
  });

  it('GET / returns health status', async () => {
    const response = await client.get('/api/health');
    const data = expectSuccessResponse(response);

    expect(data).toMatchObject({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });

  it('validates input against the contract', async () => {
    const response = await client.post('/api/automations/not-a-number/run');

    expectErrorResponse(response, 400, 'VALIDATION_ERROR');
  });
});
```

### Service Tests

Test business logic in isolation:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { UserService } from './userService';
import { NotFoundError } from '@server/errors';
import type { DataSource } from 'typeorm';

describe('UserService', () => {
  it('gets user by id', async () => {
    const mockRepo = {
      findOneBy: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
    };

    const dataSource = {
      getRepository: vi.fn().mockReturnValue(mockRepo),
    } as unknown as DataSource;

    const service = new UserService(dataSource);
    const user = await service.getById(1);

    expect(user).toEqual({ id: 1, name: 'John' });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: 1 });
  });

  it('throws NotFoundError when user not found', async () => {
    const mockRepo = {
      findOneBy: vi.fn().mockResolvedValue(null),
    };

    const dataSource = {
      getRepository: vi.fn().mockReturnValue(mockRepo),
    } as unknown as DataSource;

    const service = new UserService(dataSource);

    await expect(service.getById(999)).rejects.toThrow(NotFoundError);
  });
});
```

### Error Boundary Tests

Test error catching:

```typescript
import { render, screen } from '@tests/helpers/component';
import { vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowError() {
  throw new Error('Test error');
}

describe('ErrorBoundary', () => {
  it('catches and displays errors', () => {
    // Suppress console.error in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

## Testing Patterns

### Testing Async Behavior

```typescript
import { waitFor } from '@testing-library/react';

it('loads data', async () => {
  render(<DataComponent />);

  // Wait for specific condition
  await waitFor(() => {
    expect(screen.queryByRole('img', { name: /loading/i })).not.toBeInTheDocument();
  });

  expect(screen.getByText('Loaded data')).toBeInTheDocument();
});

// Or use findBy (waits automatically)
it('loads data', async () => {
  render(<DataComponent />);

  expect(await screen.findByText('Loaded data')).toBeInTheDocument();
});
```

### Testing Forms

```typescript
it('submits form with validation', async () => {
  const user = setupUser();
  const onSubmit = vi.fn();

  render(<ContactForm onSubmit={onSubmit} />);

  // Fill form
  await user.type(screen.getByLabelText(/name/i), 'John Doe');
  await user.type(screen.getByLabelText(/email/i), 'john@example.com');

  // Submit
  await user.click(screen.getByRole('button', { name: /submit/i }));

  // Verify
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
    email: 'john@example.com',
  });
});
```

### Testing Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react';

it('fetches data', async () => {
  const { result } = renderHook(() => useUserData(1));

  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeUndefined();

  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });

  expect(result.current.data).toEqual({ id: 1, name: 'John' });
});
```

## Mocking

### Module Mocks

```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('./api', () => ({
  fetchUser: vi.fn(() => Promise.resolve({ id: 1 })),
}));

// Mock with implementation
const mockFetchUser = vi.fn();
vi.mock('./api', () => ({ fetchUser: mockFetchUser }));

// Use in test
mockFetchUser.mockResolvedValue({ id: 2 });
```

### MSW (API Mocks)

MSW automatically mocks HTTP in client tests. Warden's own API is mocked from the API contract:

```typescript
// tests/mocks/handlers/automations.ts
import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

export const automationsHandlers = [
  mockProcedure(contract.automations.list, () => MOCK_AUTOMATIONS),
];

// Override per test — a raw failure goes at the procedure's own path
import { contractPath } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';

it('handles API error', async () => {
  server.use(
    http.get(contractPath(contract.automations.list), () =>
      HttpResponse.json(
        { status: 'error', error: { type: 'NOT_FOUND', message: 'Not found' } },
        { status: 404 }
      )
    )
  );

  // Test error handling...
});
```

### Database Mocks

```typescript
// Unit test: Mock DataSource
const mockDataSource = {
  getRepository: vi.fn().mockReturnValue({
    findOneBy: vi.fn().mockResolvedValue({ id: 1 }),
    save: vi.fn().mockImplementation((entity) => entity),
  }),
} as unknown as DataSource;

// Integration test: Use :memory: database
import { initializeDatabase } from '@server/database';
import { createMockConfig } from '@tests/factories';

let dataSource: DataSource;

beforeAll(async () => {
  dataSource = await initializeDatabase(createMockConfig({ DB_PATH: ':memory:' }));
});

afterAll(async () => {
  await dataSource.destroy();
});
```

## Best Practices

### DO ✅

- **Use test helpers** - Consistent, maintainable tests
- **Test behavior, not implementation** - Click, type, read
- **Use factories** - Generate test data consistently
- **Test error states** - Don't just test happy paths
- **Mock external dependencies** - APIs, databases, timers
- **Keep tests focused** - One assertion theme per test
- **Clean up** - Reset mocks, close connections

### DON'T ❌

- **Test implementation details** - Internal state, class names
- **Hardcode test data** - Use factories
- **Share state** - Each test isolated
- **Use arbitrary timeouts** - Use `waitFor` with conditions
- **Test library code** - Trust React, Express work
- **Overuse snapshots** - Brittle, hard to maintain
- **Skip cleanup** - Causes flaky tests

## Debugging

### View rendered output

```typescript
import { screen } from '@testing-library/react';

// Print DOM
screen.debug();

// Print specific element
screen.debug(screen.getByRole('button'));
```

### Run specific tests

```bash
# One file
yarn test Button.test.tsx

# One test
yarn test Button.test.tsx -t "handles click"

# Watch mode
yarn test --watch
```

### Common Issues

**"Element not found"**
- Use `screen.debug()` to see what's rendered
- Check spelling/casing
- Wait for async: `await screen.findByText()`

**"Test timeout"**
- Increase timeout: `it('test', async () => {}, 10000)`
- Check for missing `await`
- Look for infinite loops

**"MSW not working"**
- MSW only works in client tests (happy-dom)
- Server tests use supertest (no MSW)
- Check handler URL matches exactly

## Coverage

```bash
yarn test:coverage
open coverage/index.html
```

**Goals:**
- Statements: > 80%
- Branches: > 75%
- Functions: > 80%
- Lines: > 80%

Focus on critical paths, not 100% coverage.

## Further Reading

- [Testing Architecture](./TESTING.md) - Setup and commands
- [React Testing Library](https://testing-library.com/react) - Component testing
- [Vitest](https://vitest.dev/) - Test runner
- [MSW](https://mswjs.io/) - API mocking
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
