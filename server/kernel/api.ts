import { contract } from '@contract/index';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { ORPCError, implement } from '@orpc/server';
import type { Router } from '@orpc/server';
import type { RequestHandler } from 'express';
import type { PublicUser } from '../database/schema';
import { AppError } from './errors';

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

/**
 * Runs a procedure and wraps its validated output in the success envelope. An
 * AppError it throws keeps its HTTP status and type on the way out.
 */
async function inSuccessEnvelope(runProcedure: () => Promise<unknown>) {
  try {
    return { status: 'ok', data: await runProcedure() };
  } catch (err) {
    if (err instanceof AppError) {
      throw new ORPCError(err.type, { status: err.statusCode, message: err.message });
    }
    throw err;
  }
}

/** Serves a (sub)router of contract procedures over HTTP at their contract paths. */
export function serveApi(router: Router<AnyContractRouter, ApiContext>): RequestHandler {
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [({ next }) => inSuccessEnvelope(next)],
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
