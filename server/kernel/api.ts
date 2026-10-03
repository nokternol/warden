import { contract } from '@contract/index';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { implement } from '@orpc/server';
import type { Router } from '@orpc/server';
import type { RequestHandler } from 'express';

/** What every procedure handler receives about the request it serves. */
export interface ApiContext {
  requestId: string;
}

/** The contract implementer every module builds its procedures from. */
export const api = implement(contract).$context<ApiContext>();

/** Serves a (sub)router of contract procedures over HTTP at their contract paths. */
export function serveApi(router: Router<AnyContractRouter, ApiContext>): RequestHandler {
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [async ({ next }) => ({ status: 'ok', data: await next() })],
  });

  return (req, res, next) => {
    handler
      .handle(req, res, { context: { requestId: req.requestId } })
      .then(({ matched }) => {
        if (!matched) next();
      })
      .catch(next);
  };
}
