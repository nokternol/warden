/**
 * A provider's stored URL is the host the user enters with the type's API
 * path appended. These two functions are that join and its inverse, shared
 * by the client's forms and the server's connection probe.
 */

/** The URL to reach a provider's API: `host` without trailing slashes, then `apiPath`. */
export function apiUrlOf(host: string, apiPath: string): string {
  return `${host.replace(/\/+$/, '')}${apiPath}`;
}

/** The host the user entered, recovered from a stored URL by removing `apiPath`. */
export function hostOf(url: string, apiPath: string): string {
  if (apiPath && url.endsWith(apiPath)) return url.slice(0, -apiPath.length);
  return url;
}
