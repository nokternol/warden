import { automations } from './automations';
import { mediaQueries } from './mediaQueries';
import { providers } from './providers';
import { system } from './system';

/** Warden's HTTP API: every procedure the client may call and the server must implement. */
export const contract = {
  automations,
  mediaQueries,
  providers,
  system,
};

export type Contract = typeof contract;
