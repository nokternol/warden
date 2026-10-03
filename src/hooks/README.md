# Custom Hooks

Reusable React hooks for common patterns.

## Purpose

Encapsulate reusable logic:
- Data fetching patterns
- Local state management
- Effect abstractions

## Convention

Hook files follow `use*.ts` naming:

Hooks reach the API only through the contract client (`@app/lib/api/client`): reads go through the
one generic SWR hook `useApi(procedure, input)`, writes call the procedure directly. No hook writes a
URL or its own fetcher; the client unwraps the envelope, validates the payload against the contract and
rejects with the server's error message.

```typescript
// hooks/useMediaQueries.ts
import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';

export function useMediaQueries() {
  const { data: queries = [], isLoading, mutate } = useApi(api.mediaQueries.list, undefined);

  const remove = async (id: number) => {
    await api.mediaQueries.delete({ id });
    await mutate();
  };

  return { queries, isLoading, remove };
}
```

A `null` input defers the fetch (`useApi(api.mediaQueries.preview, id > 0 ? { id } : null)`).

## Testing Hooks

Use `renderHook` from `@testing-library/react`:

```typescript
import { contract } from '@contract/index';
import { renderHook, waitFor } from '@testing-library/react';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { useMediaQueries } from './useMediaQueries';

it('lists queries', async () => {
  server.use(mockProcedure(contract.mediaQueries.list, () => [QUERY]));

  const { result } = renderHook(() => useMediaQueries(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  expect(result.current.queries).toEqual([QUERY]);
});
```
