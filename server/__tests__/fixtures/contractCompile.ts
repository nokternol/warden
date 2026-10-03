/**
 * Compile-time proof, checked by `yarn typecheck`, that the server can't drift
 * from the API contract. Each `@ts-expect-error` fails the typecheck if the
 * line below it ever starts compiling.
 */
import { api } from '@server/kernel/api';

export const missingHandler = () =>
  // @ts-expect-error a contract router missing one of its procedures' handlers does not compile
  api.automations.router({ list: api.automations.list.handler(async () => []) });

export const wrongOutput = () =>
  // @ts-expect-error a handler returning a shape the contract doesn't declare does not compile
  api.system.health.handler(async () => ({ status: 'ok' }));
