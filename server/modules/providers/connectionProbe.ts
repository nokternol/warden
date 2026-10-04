import { MetadataProviderType } from '@server/database/schema';
import ky from 'ky';
import { PROVIDER_CATALOGUE } from './providerCatalogue';

/**
 * Probes a provider's connection details with one cheap call to its upstream
 * API; resolves when the provider answers, rejects otherwise. TVmaze is public
 * and keyless, so it resolves without a call.
 */
export async function probeConnection(
  type: MetadataProviderType,
  host: string,
  apiKey?: string
): Promise<void> {
  const base = host.replace(/\/+$/, '') + PROVIDER_CATALOGUE[type].apiPath;
  const key = apiKey ?? '';
  const timeout = 8000;

  switch (type) {
    case MetadataProviderType.SONARR:
    case MetadataProviderType.RADARR:
      await ky.get(`${base}/system/status`, { searchParams: { apikey: key }, timeout }).json();
      break;
    case MetadataProviderType.PLEX:
      await ky
        .get(`${base}/identity`, {
          headers: { 'X-Plex-Token': key, Accept: 'application/json' },
          timeout,
        })
        .json();
      break;
    case MetadataProviderType.JELLYFIN:
      await ky
        .get(`${base}/System/Ping`, {
          headers: { 'X-Emby-Authorization': `MediaBrowser Token="${key}"` },
          timeout,
        })
        .text();
      break;
    case MetadataProviderType.TAUTULLI:
      await ky
        .get(`${base}/api/v2`, { searchParams: { cmd: 'get_server_info', apikey: key }, timeout })
        .json();
      break;
    case MetadataProviderType.SEERR:
    case MetadataProviderType.OVERSEERR:
      await ky.get(`${base}/api/v1/status`, { headers: { 'X-Api-Key': key }, timeout }).json();
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
