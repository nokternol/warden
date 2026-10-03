import { contract } from '@contract/index';
import { ORPCError, createORPCClient } from '@orpc/client';
import { type ContractRouterClient, isContractProcedure } from '@orpc/contract';
import { ResponseValidationPlugin } from '@orpc/contract/plugins';
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

/**
 * A failed answer from the API is `{status:'error', error:{type, message, errors?}}`;
 * callers receive it as an ORPCError whose `data.errors` holds a validation
 * failure's field errors. Anything else (a proxy's error page, say) falls back
 * to oRPC's error for the HTTP status.
 */
function errorFromEnvelope(body: unknown, response: StandardLazyResponse) {
  const { error } = (body ?? {}) as {
    error?: { type: string; message: string; errors?: Record<string, string[]> };
  };
  if (!error) return null;
  return new ORPCError(error.type, {
    status: response.status,
    message: error.message,
    data: error.errors ? { errors: error.errors } : undefined,
  });
}

/**
 * Binds each contract procedure to one function created once, so a procedure
 * has a stable identity callers can use as a cache key.
 */
function bind(node: object, client: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => {
      const target = client[key] as Record<string, unknown> & ((...args: unknown[]) => unknown);
      return [
        key,
        isContractProcedure(child) ? (...args: unknown[]) => target(...args) : bind(child, target),
      ];
    })
  );
}

/**
 * A contract client for one origin. The browser's default is its own origin;
 * server-side rendering passes the API's own address and the caller's cookie.
 */
export function createApiClient(
  options: { url?: string; headers?: Record<string, string> } = {}
): ApiClient {
  const link = new OpenAPILink(contract, {
    url: () => options.url ?? window.location.origin,
    headers: options.headers,
    clientInterceptors: [unwrapSuccessEnvelope],
    customErrorResponseBodyDecoder: errorFromEnvelope,
    plugins: [new ResponseValidationPlugin(contract)],
  });
  const client: ApiClient = createORPCClient(link);
  return bind(contract, client as unknown as Record<string, unknown>) as unknown as ApiClient;
}

export const api = createApiClient();
