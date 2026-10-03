import { automations } from './automations';

/** Warden's HTTP API: every procedure the client may call and the server must implement. */
export const contract = {
  automations,
};

export type Contract = typeof contract;
