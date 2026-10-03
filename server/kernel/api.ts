import { contract } from '@contract/index';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { ORPCError, implement } from '@orpc/server';
import type { Router } from '@orpc/server';
import type { RequestHandler } from 'express';
import type { PublicUser } from '../database/schema';

/** What every procedure handler receives about the request it serves. */
export interface ApiContext {
  requestId: string;
  user?: PublicUser;
}

/**
 * The contract implementer every module builds its procedures from. Its root
 * middleware is default-deny: a procedure answers without a signed-in user only
 * when the contract marks it `public`.
 */
export const api = implement(contract)
  .$context<ApiContext>()
  .use(({ context, procedure, next }) => {
    if (!procedure['~orpc'].meta.public && !context.user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Authentication required' });
    }
    return next();
  });

/** Serves a (sub)router of contract procedures over HTTP at their contract paths. */
export function serveApi(router: Router<AnyContractRouter, ApiContext>): RequestHandler {
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [async ({ next }) => ({ status: 'ok', data: await next() })],
    customErrorResponseBodyEncoder: (error) => ({
      status: 'error',
      error: { type: error.code, message: error.message },
    }),
  });

  return (req, res, next) => {
    handler
      .handle(req, res, { context: { requestId: req.requestId, user: req.user } })
      .then(({ matched }) => {
        if (!matched) next();
      })
      .catch(next);
  };
}
