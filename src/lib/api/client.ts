import { contract } from '@contract/index';
import { createORPCClient } from '@orpc/client';
import { type ContractRouterClient, isContractProcedure } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import type { StandardLazyResponse } from '@orpc/standard-server';

/** A client for every procedure of the API contract. */
export type ApiClient = ContractRouterClient<typeof contract>;

/** Every successful answer is `{status:'ok', data}`; callers receive `data`. */
const unwrapSuccessEnvelope = async ({ next }: { next: () => Promise<StandardLazyResponse> }) => {
  const response = await next();
  if (response.status >= 400) return response;
  return {
    ...response,
    body: async () => ((await response.body()) as { data: unknown }).data,
  };
};

const link = new OpenAPILink(contract, {
  url: () => window.location.origin,
  clientInterceptors: [unwrapSuccessEnvelope],
});

/**
 * Binds each contract procedure to one function created once, so a procedure
 * has a stable identity callers can use as a cache key.
 */
function bind(node: object, client: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => {
      const target = client[key] as Record<string, unknown> & ((input: unknown) => unknown);
      return [
        key,
        isContractProcedure(child) ? (input: unknown) => target(input) : bind(child, target),
      ];
    })
  );
}

const client: ApiClient = createORPCClient(link);

export const api = bind(
  contract,
  client as unknown as Record<string, unknown>
) as unknown as ApiClient;
