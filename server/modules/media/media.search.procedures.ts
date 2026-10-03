import type { SearchResult } from '@contract/media';
import { MetadataProviderType } from '@server/database/schema';
import type { MetadataProvider } from '@server/database/schema';
import { api } from '@server/kernel/api';
import { getChildLogger } from '@server/kernel/logger';
import {
  JellyfinProvider,
  OverseerrProvider,
  PlexProvider,
  type ProviderSettingsService,
  RadarrProvider,
  SonarrProvider,
  TautulliProvider,
} from '@server/modules/providers';

const log = getChildLogger('SearchProcedures');

interface SearchCradle {
  providerSettingsService: ProviderSettingsService;
}

const SEARCHABLE_TYPES = [
  MetadataProviderType.SONARR,
  MetadataProviderType.RADARR,
  MetadataProviderType.PLEX,
  MetadataProviderType.JELLYFIN,
  MetadataProviderType.TAUTULLI,
  MetadataProviderType.OVERSEERR,
];

async function searchProvider(provider: MetadataProvider, title: string): Promise<SearchResult> {
  const base: Pick<SearchResult, 'providerId' | 'name' | 'type'> = {
    providerId: provider.id,
    name: provider.name,
    type: provider.type,
  };

  try {
    switch (provider.type) {
      case MetadataProviderType.SONARR: {
        const p = new SonarrProvider(provider, log);
        const data = await p.lookupSeries(title);
        return { ...base, status: 'ok', data };
      }
      case MetadataProviderType.RADARR: {
        const p = new RadarrProvider(provider, log);
        const data = await p.lookupMovies(title);
        return { ...base, status: 'ok', data };
      }
      case MetadataProviderType.PLEX: {
        const p = new PlexProvider(provider, log);
        const libraries = await p.getLibraries();
        const allItems = await Promise.all(libraries.map((lib) => p.getLibraryContents(lib.key)));
        const lowerTitle = title.toLowerCase();
        const data = allItems
          .flat()
          .filter((item) => item.title.toLowerCase().includes(lowerTitle));
        return { ...base, status: 'ok', data };
      }
      case MetadataProviderType.JELLYFIN: {
        const p = new JellyfinProvider(provider, log);
        const libraries = await p.getLibraries();
        const allItems = await Promise.all(
          libraries.map((lib) => p.getLibraryContents(lib.ItemId))
        );
        const lowerTitle = title.toLowerCase();
        const data = allItems.flat().filter((item) => item.Name.toLowerCase().includes(lowerTitle));
        return { ...base, status: 'ok', data };
      }
      case MetadataProviderType.TAUTULLI: {
        const p = new TautulliProvider(provider, log);
        const data = await p.searchHistory(title);
        return { ...base, status: 'ok', data };
      }
      case MetadataProviderType.OVERSEERR: {
        const p = new OverseerrProvider(provider, log);
        const data = await p.search(title);
        return { ...base, status: 'ok', data };
      }
      default:
        return { ...base, status: 'unavailable' };
    }
  } catch (err) {
    log.warn(`Search failed for provider ${provider.name}`, { err });
    return { ...base, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export function createSearchProcedures(cradle: SearchCradle) {
  const { providerSettingsService } = cradle;

  return {
    search: api.media.search.handler(async ({ input }) => {
      const providers = await providerSettingsService.findActiveByTypes(SEARCHABLE_TYPES);
      const results = await Promise.allSettled(
        providers.map((p) => searchProvider(p, input.title))
      );
      return results.map(
        (r): SearchResult =>
          r.status === 'fulfilled'
            ? r.value
            : {
                providerId: -1,
                name: 'unknown',
                type: 'unknown',
                status: 'error',
                error: String(r.reason),
              }
      );
    }),
  };
}
