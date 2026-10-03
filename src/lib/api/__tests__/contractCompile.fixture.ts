/**
 * Compile-time proof, checked by `yarn typecheck`, that the client can't call
 * outside the API contract. Each `@ts-expect-error` fails the typecheck if the
 * line below it ever starts compiling.
 */
import { api } from '@app/lib/api/client';

export const unknownProcedure = () =>
  // @ts-expect-error a procedure the contract doesn't declare does not compile
  api.automations.archive({ id: 1 });

export const wrongInput = () =>
  // @ts-expect-error input the contract doesn't accept does not compile
  api.automations.run({ id: true });
