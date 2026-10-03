import { automations } from './automations';
import { mediaQueries } from './mediaQueries';
import { system } from './system';

/** Warden's HTTP API: every procedure the client may call and the server must implement. */
export const contract = {
  automations,
  mediaQueries,
  system,
};

export type Contract = typeof contract;
