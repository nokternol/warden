import { MetadataProviderType } from '@server/database/schema';
import { api } from '@server/kernel/api';
import type { ProviderSettingsService } from '@server/modules/providers';
import ky from 'ky';

const API_SUFFIXES: Record<string, string> = {
  SONARR: '/api/v3',
  RADARR: '/api/v3',
  PLEX: '',
  JELLYFIN: '',
  TAUTULLI: '',
  OVERSEERR: '',
  SEERR: '',
  TMDB: '',
  OMDB: '',
  TVMAZE: '',
};

async function probeProvider(
  type: MetadataProviderType,
  host: string,
  apiKey?: string
): Promise<void> {
  const suffix = API_SUFFIXES[type] ?? '';
  const base = host.replace(/\/+$/, '') + suffix;
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

interface SettingsCradle {
  providerSettingsService: ProviderSettingsService;
}

/** Provider CRUD and connection testing, declared under `providers` in the contract. */
export function createProviderSettingsProcedures(
  cradle: SettingsCradle,
  invalidateMediaCaches?: () => void
) {
  const { providerSettingsService } = cradle;

  return {
    list: api.providers.list.handler(async () => providerSettingsService.list()),

    create: api.providers.create.handler(async ({ input }) =>
      providerSettingsService.create({ ...input, type: input.type as MetadataProviderType })
    ),

    update: api.providers.update.handler(async ({ input }) => {
      const { id, ...patch } = input;
      const result = await providerSettingsService.update(id, patch);
      invalidateMediaCaches?.();
      return result;
    }),

    delete: api.providers.delete.handler(async ({ input }) => {
      await providerSettingsService.delete(input.id);
      invalidateMediaCaches?.();
      return null;
    }),

    test: api.providers.test.handler(async ({ input }) => {
      try {
        await probeProvider(input.type as MetadataProviderType, input.url, input.apiKey);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  };
}
