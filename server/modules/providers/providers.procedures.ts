import type { ProviderType, TaskOptionsRoute } from '@contract/providers';
import { scope } from '@contract/scope';
import { MetadataProviderType } from '@server/database/schema';
import type { MetadataProvider } from '@server/database/schema';
import { api } from '@server/kernel/api';
import type { AppConfig } from '@server/kernel/config';
import { getChildLogger } from '@server/kernel/logger';
import { probeConnection } from './connectionProbe';
import { JellyfinProvider } from './connections/jellyfinProvider';
import { OmdbProvider } from './connections/omdbProvider';
import { OverseerrProvider } from './connections/overseerrProvider';
import { PlexProvider } from './connections/plexProvider';
import { RadarrProvider } from './connections/radarrProvider';
import { SonarrProvider } from './connections/sonarrProvider';
import { TautulliProvider } from './connections/tautulliProvider';
import { TmdbProvider } from './connections/tmdbProvider';
import { TvMazeProvider } from './connections/tvmazeProvider';
import { resolveApiKey } from './keyResolver';
import { PROVIDER_CATALOGUE } from './providerCatalogue';
import type { ProviderFactory } from './providerFactory';
import type { ProviderSettingsService } from './providerSettingsService';
import { aggregateRatings } from './ratingsAggregation';
import { isMediaActuator } from './roles';
import { readEnabledTaskIds } from './taskEnablement';

const log = getChildLogger('ProvidersProcedures');

/**
 * Compile-time witness that the contract's provider types are exactly
 * MetadataProviderType's values, so `type` from a request can be read as one.
 */
type ProviderTypesAgree = [ProviderType] extends [`${MetadataProviderType}`]
  ? [`${MetadataProviderType}`] extends [ProviderType]
    ? true
    : never
  : never;
const _providerTypesAgree: ProviderTypesAgree = true;

interface ProvidersCradle {
  providerSettingsService: ProviderSettingsService;
  providerFactory: ProviderFactory;
  config: AppConfig;
}

interface TaskOption {
  id: string;
  label: string;
}

/**
 * A provider instance's live choices for a parameterized task's `select`
 * control. `undefined` means this provider type has nothing to say about
 * `route` — omitted from the response, not surfaced as an empty list.
 * `collections`/`language-profiles` return `[]` for their owning provider
 * type: the procedure gives the client a stable shape to call, and the empty
 * list is the answer while no provider fetches collections or language profiles.
 */
async function resolveTaskOptions(
  provider: MetadataProvider,
  route: TaskOptionsRoute,
  providerFactory: ProviderFactory
): Promise<TaskOption[] | undefined> {
  switch (route) {
    case 'quality-profiles': {
      if (
        provider.type !== MetadataProviderType.RADARR &&
        provider.type !== MetadataProviderType.SONARR
      ) {
        return undefined;
      }
      const instance = providerFactory.create(provider, log) as RadarrProvider | SonarrProvider;
      const profiles = await instance.getProfiles();
      return profiles.map((p) => ({ id: String(p.id), label: p.name }));
    }
    case 'root-folders': {
      if (
        provider.type !== MetadataProviderType.RADARR &&
        provider.type !== MetadataProviderType.SONARR
      ) {
        return undefined;
      }
      const instance = providerFactory.create(provider, log) as RadarrProvider | SonarrProvider;
      const folders = await instance.getRootFolders();
      return folders.map((f) => ({ id: String(f.id), label: f.path }));
    }
    case 'collections':
      return provider.type === MetadataProviderType.JELLYFIN ? [] : undefined;
    case 'language-profiles':
      return provider.type === MetadataProviderType.SONARR ? [] : undefined;
  }
}

/**
 * The `providers` procedures of the API contract: configured-instance CRUD,
 * connection probing, and provider capabilities. `invalidateMediaCaches` runs
 * after an instance is updated or deleted so media caches never serve data
 * from a provider that changed.
 */
export function createProvidersProcedures(
  cradle: ProvidersCradle,
  invalidateMediaCaches: () => void
) {
  const { providerSettingsService, providerFactory, config } = cradle;

  return {
    // ─── Catalogue ─────────────────────────────────────────────────────────
    types: api.providers.types.handler(async () =>
      PROVIDER_CATALOGUE.filter((entry) => !scope.deferred.providerTypes.includes(entry.type))
    ),

    // ─── Configured instances ──────────────────────────────────────────────
    list: api.providers.list.handler(async () => providerSettingsService.list()),

    create: api.providers.create.handler(async ({ input }) =>
      providerSettingsService.create({ ...input, type: input.type as MetadataProviderType })
    ),

    update: api.providers.update.handler(async ({ input }) => {
      const { id, ...patch } = input;
      const result = await providerSettingsService.update(id, patch);
      invalidateMediaCaches();
      return result;
    }),

    delete: api.providers.delete.handler(async ({ input }) => {
      await providerSettingsService.delete(input.id);
      invalidateMediaCaches();
      return null;
    }),

    test: api.providers.test.handler(async ({ input }) => {
      try {
        await probeConnection(input.type as MetadataProviderType, input.url, input.apiKey);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),

    // ─── Capabilities ──────────────────────────────────────────────────────
    tasks: api.providers.tasks.handler(async () => {
      const providers = await providerSettingsService.list();

      return providers.flatMap((p) => {
        let instance: object;
        try {
          instance = providerFactory.create(p as unknown as MetadataProvider, log);
        } catch {
          // A configured type with no constructable provider cannot be an actuator.
          return [];
        }
        if (!isMediaActuator(instance)) return [];

        const enabled = readEnabledTaskIds(p.settings);
        return [
          {
            providerId: p.id,
            type: p.type,
            tasks: instance.tasks().map(({ run: _run, ...descriptor }) => ({
              ...descriptor,
              enabled: enabled.includes(descriptor.id),
            })),
          },
        ];
      });
    }),

    taskOptions: api.providers.taskOptions.handler(async ({ input: params }) => {
      const providers = await providerSettingsService.list();

      const entries = await Promise.all(
        providers.map(async (p) => {
          try {
            const options = await resolveTaskOptions(p, params.route, providerFactory);
            if (options === undefined) return undefined;
            return { providerId: p.id, type: p.type, options };
          } catch (err) {
            log.warn('Task options fetch failed', { provider: p.name, route: params.route, err });
            return undefined;
          }
        })
      );

      return entries.filter((e): e is NonNullable<typeof e> => e !== undefined);
    }),

    metadata: api.providers.metadata.handler(async ({ input }) => {
      const { url, apiKey, settings } = input;
      const type = input.type as MetadataProviderType;
      const config = { name: `adhoc-${type}`, url, apiKey, settings };

      log.debug('Fetching provider metadata', { type, url });

      switch (type) {
        case MetadataProviderType.SONARR: {
          const provider = new SonarrProvider(config, log);
          const [series, qualityProfiles, rootFolders, tags] = await Promise.all([
            provider.getSeries(),
            provider.getProfiles(),
            provider.getRootFolders(),
            provider.getTags(),
          ]);
          return { type, data: { series, qualityProfiles, rootFolders, tags } };
        }

        case MetadataProviderType.RADARR: {
          const provider = new RadarrProvider(config, log);
          const [movies, qualityProfiles, rootFolders, tags] = await Promise.all([
            provider.getMovies(),
            provider.getProfiles(),
            provider.getRootFolders(),
            provider.getTags(),
          ]);
          return { type, data: { movies, qualityProfiles, rootFolders, tags } };
        }

        case MetadataProviderType.PLEX: {
          const provider = new PlexProvider(config, log);
          const libraries = await provider.getLibraries();
          return { type, data: { libraries } };
        }

        case MetadataProviderType.JELLYFIN: {
          const provider = new JellyfinProvider(config, log);
          const libraries = await provider.getLibraries();
          return { type, data: { libraries } };
        }

        case MetadataProviderType.TAUTULLI: {
          const provider = new TautulliProvider(config, log);
          const [libraryStats, homeStats, recentHistory] = await Promise.all([
            provider.getLibraryStats(),
            provider.getHomeStats(),
            provider.getHistory(),
          ]);
          return { type, data: { libraryStats, homeStats, recentHistory } };
        }

        case MetadataProviderType.OVERSEERR:
        case MetadataProviderType.SEERR: {
          const provider = new OverseerrProvider(config, log);
          const requests = await provider.getRequests();
          return { type, data: { requests } };
        }
      }
    }),

    ratings: api.providers.ratings.handler(async ({ input }) => {
      const { title, year, tmdbApiKey, omdbApiKey } = input;

      const dbProviders = await providerSettingsService.findActiveByTypes([
        MetadataProviderType.TMDB,
        MetadataProviderType.OMDB,
      ]);
      const dbTmdbKey =
        dbProviders.find((p) => p.type === MetadataProviderType.TMDB)?.apiKey ?? null;
      const dbOmdbKey =
        dbProviders.find((p) => p.type === MetadataProviderType.OMDB)?.apiKey ?? null;

      const { key: resolvedTmdbKey } = resolveApiKey(
        tmdbApiKey,
        dbTmdbKey,
        config.TMDB_API_KEY || undefined
      );
      const { key: resolvedOmdbKey } = resolveApiKey(omdbApiKey, dbOmdbKey, undefined);

      log.debug('Fetching aggregated ratings', { title, year, hasTmdb: !!resolvedTmdbKey });

      const [tmdbRating, omdbRating, tvmazeRating] = await Promise.all([
        resolvedTmdbKey
          ? (async () => {
              try {
                const provider = new TmdbProvider(
                  {
                    name: 'tmdb',
                    url: 'https://api.themoviedb.org/3',
                    apiKey: resolvedTmdbKey,
                    settings: null,
                  },
                  log
                );
                return await provider.getRatings(title, year);
              } catch (error) {
                log.warn('TMDB fetch failed', { error });
                return { source: 'tmdb' as const, found: false };
              }
            })()
          : Promise.resolve(undefined),

        resolvedOmdbKey
          ? (async () => {
              try {
                const provider = new OmdbProvider(
                  {
                    name: 'omdb',
                    url: 'https://www.omdbapi.com',
                    apiKey: resolvedOmdbKey,
                    settings: null,
                  },
                  log
                );
                return await provider.getRatings(title, year);
              } catch (error) {
                log.warn('OMDB fetch failed', { error });
                return { source: 'omdb' as const, found: false };
              }
            })()
          : Promise.resolve(undefined),

        (async () => {
          try {
            const provider = new TvMazeProvider(
              { name: 'tvmaze', url: 'https://api.tvmaze.com', apiKey: null, settings: null },
              log
            );
            return await provider.getRatings(title, year);
          } catch (error) {
            log.warn('TVMaze fetch failed', { error });
            return { source: 'tvmaze' as const, found: false };
          }
        })(),
      ]);

      const aggregated = aggregateRatings(title, year, tmdbRating, omdbRating, tvmazeRating);

      return aggregated;
    }),
  };
}
