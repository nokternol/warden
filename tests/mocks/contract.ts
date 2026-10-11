import type { ContractProcedure, ErrorMap, InferSchemaOutput, Meta, Schema } from '@orpc/contract';
import { http, HttpResponse, type PathParams } from 'msw';
import type { ApiErrorResponse } from '../../server/types/api';

type AnyProcedure = ContractProcedure<
  Schema<unknown, unknown>,
  Schema<unknown, unknown>,
  ErrorMap,
  Meta
>;

/** What a contract procedure answers, as the client receives it. */
export type ProcedureOutput<P> = P extends ContractProcedure<
  Schema<unknown, unknown>,
  infer TOutput,
  ErrorMap,
  Meta
>
  ? InferSchemaOutput<TOutput>
  : never;

/** A procedure's contract path as an MSW path pattern (`{id}` becomes `:id`). */
export function contractPath(procedure: AnyProcedure): string {
  return (procedure['~orpc'].route.path ?? '').replace(/\{(\w+)\}/g, ':$1');
}

/** An MSW handler factory for a procedure's own method. */
function handlerFor(procedure: AnyProcedure) {
  const { method = 'POST' } = procedure['~orpc'].route;
  return http[method.toLowerCase() as Lowercase<typeof method>];
}

/**
 * Mocks a contract procedure at its own method and path, answering the
 * resolver's output inside the success envelope. The resolver must return the
 * procedure's contract output, so a mock that drifts fails to compile.
 */
export function mockProcedure<P extends AnyProcedure>(
  procedure: P,
  resolve: (info: {
    params: PathParams;
    request: Request;
  }) => ProcedureOutput<P> | Promise<ProcedureOutput<P>>
) {
  const { successStatus = 200 } = procedure['~orpc'].route;

  return handlerFor(procedure)(contractPath(procedure), async ({ params, request }) =>
    HttpResponse.json(
      { status: 'ok', data: await resolve({ params, request }) },
      { status: successStatus }
    )
  );
}

/**
 * Mocks a contract procedure failing at its own method and path. Given an
 * error, it answers the server's error envelope with that status; without one,
 * it answers the bare status, as a proxy or a crashed server would.
 */
export function mockProcedureFailure(
  procedure: AnyProcedure,
  status: number,
  error?: ApiErrorResponse['error']
) {
  return handlerFor(procedure)(contractPath(procedure), () =>
    error
      ? HttpResponse.json<ApiErrorResponse>({ status: 'error', error }, { status })
      : new HttpResponse(null, { status })
  );
}
