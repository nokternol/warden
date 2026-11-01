import { apiUrlOf } from '@contract/providerUrl';
import { MetadataProviderType } from '@server/database/schema';
import ky, { HTTPError } from 'ky';
import { PROVIDER_CATALOGUE } from './providerCatalogue';

/**
 * Probes a provider's connection details with one cheap call to its upstream API; resolves when
 * the provider accepts them, rejects otherwise. Each call uses an endpoint that demands the key,
 * since a public one would pass with any key or none. TVmaze is public and keyless, so it resolves
 * without a call.
 */
export async function probeConnection(
  type: MetadataProviderType,
  host: string,
  apiKey?: string
): Promise<void> {
  const base = apiUrlOf(host, PROVIDER_CATALOGUE[type].apiPath);
  const key = apiKey ?? '';
  if (PROVIDER_CATALOGUE[type].apiKeyRequired && key === '') {
    throw new Error('Enter the API key to test this connection');
  }
  const { label } = PROVIDER_CATALOGUE[type];
  try {
    await callProvider(type, base, key);
  } catch (err) {
    throw new Error(describeFailure(err, label));
  }
}

/** One status answers both questions: a refused key means the address already worked. */
function describeFailure(err: unknown, label: string): string {
  if (!(err instanceof HTTPError)) return `Couldn't reach ${label} at this address`;
  const { status } = err.response;
  if (status === 401 || status === 403) return `${label} refused this API key`;
  return `${label} answered with an error (${status})`;
}

async function callProvider(type: MetadataProviderType, base: string, key: string): Promise<void> {
  const timeout = 8000;

  switch (type) {
    case MetadataProviderType.SONARR:
    case MetadataProviderType.RADARR:
      await ky.get(`${base}/system/status`, { searchParams: { apikey: key }, timeout }).json();
      break;
    case MetadataProviderType.PLEX:
      await ky
        .get(`${base}/library/sections`, {
          headers: { 'X-Plex-Token': key, Accept: 'application/json' },
          timeout,
        })
        .json();
      break;
    case MetadataProviderType.JELLYFIN:
      await ky
        .get(`${base}/System/Info`, {
          headers: { 'X-Emby-Authorization': `MediaBrowser Token="${key}"` },
          timeout,
        })
        .json();
      break;
    case MetadataProviderType.TAUTULLI:
      await ky
        .get(`${base}/api/v2`, { searchParams: { cmd: 'get_server_info', apikey: key }, timeout })
        .json();
      break;
    case MetadataProviderType.SEERR:
      await ky.get(`${base}/api/v1/auth/me`, { headers: { 'X-Api-Key': key }, timeout }).json();
      break;
    case MetadataProviderType.TVMAZE:
      return;
    case MetadataProviderType.TMDB:
      await ky.get(`${base}/configuration`, { searchParams: { api_key: key }, timeout }).json();
      break;
    case MetadataProviderType.OMDB:
      await ky.get(base, { searchParams: { apikey: key, t: 'test' }, timeout }).json();
      break;
    default: {
      // TypeScript exhaustiveness guard — if a new MetadataProviderType is added
      // without a corresponding case above, this line will produce a compile error.
      const _exhaustive: never = type;
      throw new Error(`Unsupported provider type: ${_exhaustive}`);
    }
  }
}
