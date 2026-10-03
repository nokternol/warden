import { appSettings } from './appSettings';
import { auth } from './auth';
import { automations } from './automations';
import { media } from './media';
import { mediaQueries } from './mediaQueries';
import { providers } from './providers';
import { system } from './system';

/** Warden's HTTP API: every procedure the client may call and the server must implement. */
export const contract = {
  appSettings,
  auth,
  automations,
  media,
  mediaQueries,
  providers,
  system,
};

export type Contract = typeof contract;
