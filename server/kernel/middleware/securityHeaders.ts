import type { RequestHandler } from 'express';
import helmet from 'helmet';

const helmetOptions = { contentSecurityPolicy: false } as const;

const overHttps = helmet(helmetOptions);

/**
 * Cross-Origin-Opener-Policy is honoured only on secure origins. Warden is commonly opened over
 * plain HTTP on a LAN address, where browsers ignore the header and log an error on every page.
 */
const overHttp = helmet({ ...helmetOptions, crossOriginOpenerPolicy: false });

/**
 * Helmet's security headers, chosen per request: `req.secure` is true for HTTPS, including behind
 * a trusted proxy that reports it with X-Forwarded-Proto (the same rule as the session cookie).
 */
export const securityHeadersMiddleware: RequestHandler = (req, res, next) =>
  (req.secure ? overHttps : overHttp)(req, res, next);
