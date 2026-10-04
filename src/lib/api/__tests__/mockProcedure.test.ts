import { api } from '@app/lib/api/client';
import { contract } from '@contract/index';
import { describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../../tests/mocks/contract';
import { server } from '../../../../tests/mocks/server';

const automation = {
  id: 3,
  name: 'Weekly search',
  kind: 'user' as const,
  query: null,
  queries: [],
  provider: null,
  taskId: 'triggerSearch',
  schedule: '0 3 * * 0',
  status: 'disabled' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('mockProcedure', () => {
  it("serves the resolver's output at the procedure's own method and path", async () => {
    server.use(mockProcedure(contract.automations.list, () => [automation]));

    await expect(api.automations.list({})).resolves.toEqual([automation]);
  });
});
