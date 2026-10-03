import { contract } from '@contract/index';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { ORPCError, implement } from '@orpc/server';
import type { Router } from '@orpc/server';
import type { Request, RequestHandler } from 'express';
import type { PublicUser } from '../database/schema';
import { AppError, ValidationError } from './errors';
import { getChildLogger } from './logger';

const log = getChildLogger('Api');

/** What every procedure handler receives about the request it serves. */
export interface ApiContext {
  requestId: string;
  user?: PublicUser;
  /** The request's session, for the procedures that start and end one. */
  session: Request['session'];
  /** True when the server runs with `BYPASS_AUTH`: every procedure answers without a user. */
  authBypassed: boolean;
}

export interface ServeApiOptions {
  /** Answer every procedure without a signed-in user (`BYPASS_AUTH`, refused in production). */
  authBypass?: boolean;
}

/**
 * The contract implementer every module builds its procedures from. Its root
 * middleware is default-deny: a procedure answers without a signed-in user only
 * when the contract marks it `public`, or when the server runs with the auth bypass.
 */
export const api = implement(contract)
  .$context<ApiContext>()
  .use(({ context, procedure, next }) => {
    if (!procedure['~orpc'].meta.public && !context.user && !context.authBypassed) {
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
 * An AppError keeps its HTTP status and type, logged as an error when the
 * fault is the server's and as a warning otherwise. Input that fails the
 * contract is a 400 VALIDATION_ERROR. oRPC's other client-side errors pass
 * through; everything else, including a handler result that breaks the
 * contract's output, is a logged 500 INTERNAL_ERROR whose message is hidden in
 * production.
 */
function toApiError(err: unknown, requestId: string): ORPCError<string, unknown> {
  if (err instanceof AppError) {
    const meta = { requestId, type: err.type };
    if (err.statusCode >= 500) log.error(err.message, meta);
    else log.warn(err.message, meta);
    return new ORPCError(err.type, {
      status: err.statusCode,
      message: err.message,
      data: err instanceof ValidationError ? { errors: err.errors } : undefined,
    });
  }
  if (err instanceof ORPCError && err.code === 'BAD_REQUEST' && Array.isArray(err.data?.issues)) {
    return invalidInput(err.data.issues);
  }
  if (err instanceof ORPCError && err.status < 500) return err;

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

/**
 * A 400 VALIDATION_ERROR whose `errors` groups issues by the top-level field
 * they concern. An issue with the input as a whole (no path) has no field, so
 * it is stated in the message instead.
 */
function invalidInput(issues: InputIssue[]): ORPCError<string, unknown> {
  const errors: Record<string, string[]> = {};
  const wholeInput: string[] = [];
  for (const { message, path } of issues) {
    const first = path?.[0];
    if (first === undefined) {
      wholeInput.push(message);
      continue;
    }
    const field = String(typeof first === 'object' ? first.key : first);
    errors[field] = [...(errors[field] ?? []), message];
  }
  return new ORPCError('VALIDATION_ERROR', {
    status: 400,
    message: wholeInput.length ? `Invalid input: ${wholeInput.join('; ')}` : 'Invalid input',
    data: { errors },
  });
}

/** Serves a (sub)router of contract procedures over HTTP at their contract paths. */
export function serveApi(
  router: Router<AnyContractRouter, ApiContext>,
  { authBypass = false }: ServeApiOptions = {}
): RequestHandler {
  const handler = new OpenAPIHandler(router, {
    clientInterceptors: [({ next, context }) => inSuccessEnvelope(next, context.requestId)],
    customErrorResponseBodyEncoder: (error) => ({
      status: 'error',
      error: { type: error.code, message: error.message, ...error.data },
    }),
  });

  return (req, res, next) => {
    handler
      .handle(req, res, {
        context: {
          requestId: req.requestId,
          user: req.user,
          session: req.session,
          authBypassed: authBypass,
        },
      })
      .then(({ matched }) => {
        if (!matched) next();
      })
      .catch(next);
  };
}
