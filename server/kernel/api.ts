import { contract } from '@contract/index';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { ORPCError, implement } from '@orpc/server';
import type { Router } from '@orpc/server';
import type { RequestHandler } from 'express';
import type { PublicUser } from '../database/schema';
import { AppError } from './errors';
import { getChildLogger } from './logger';

const log = getChildLogger('Api');

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

/** Runs a procedure and wraps its validated output in the success envelope. */
async function inSuccessEnvelope(runProcedure: () => Promise<unknown>, requestId: string) {
  try {
    return { status: 'ok', data: await runProcedure() };
  } catch (err) {
    throw toApiError(err, requestId);
  }
}

/**
 * An AppError keeps its HTTP status and type; oRPC's own errors pass through;
 * anything else is a logged 500 whose message is hidden in production.
 */
function toApiError(err: unknown, requestId: string): ORPCError<string, unknown> {
  if (err instanceof AppError) {
    return new ORPCError(err.type, { status: err.statusCode, message: err.message });
  }
  if (err instanceof ORPCError && err.code === 'BAD_REQUEST' && Array.isArray(err.data?.issues)) {
    return new ORPCError('VALIDATION_ERROR', {
      status: 400,
      message: 'Invalid input',
      data: { errors: fieldErrorsOf(err.data.issues) },
    });
  }
  if (err instanceof ORPCError) return err;

  const cause = err instanceof Error ? err : new Error(String(err));
  log.error('Unhandled error', { requestId, error: cause.message, stack: cause.stack });
  return new ORPCError('INTERNAL_ERROR', {
    status: 500,
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : cause.message,
  });
}

/** A schema issue as oRPC reports it for input that failed the contract. */
interface InputIssue {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

/** Groups input issues by the top-level field they concern. */
function fieldErrorsOf(issues: InputIssue[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const { message, path } of issues) {
    const first = path?.[0];
    const field = String(typeof first === 'object' ? first.key : first);
    errors[field] = [...(errors[field] ?? []), message];
  }
  return errors;
}

/** Serves a (sub)router of contract procedures over HTTP at their contract paths. */
export function serveApi(router: Router<AnyContractRouter, ApiContext>): RequestHandler {
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [({ next, context }) => inSuccessEnvelope(next, context.requestId)],
    customErrorResponseBodyEncoder: (error) => ({
      status: 'error',
      error: { type: error.code, message: error.message, ...error.data },
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
