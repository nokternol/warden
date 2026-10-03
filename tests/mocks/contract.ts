import type { ContractProcedure, ErrorMap, InferSchemaOutput, Meta, Schema } from '@orpc/contract';
import { http, HttpResponse, type PathParams } from 'msw';

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
  const { method = 'POST', successStatus = 200 } = procedure['~orpc'].route;
  const handle = http[method.toLowerCase() as Lowercase<typeof method>];

  return handle(contractPath(procedure), async ({ params, request }) =>
    HttpResponse.json(
      { status: 'ok', data: await resolve({ params, request }) },
      { status: successStatus }
    )
  );
}
