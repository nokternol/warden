import { MetadataProviderType } from '../../../database/schema';
import type {
  JellyfinProvider,
  PlexProvider,
  SeerrProvider,
  TautulliProvider,
  TmdbProvider,
} from '../../providers';
import type { ReportedFacts } from '../../providers';
import { tmdbFieldSource } from '../mediaFieldProvider';
import { decorate } from './decorate';
import type { EnrichmentResult, MediaEnricher } from './enricher';

type PlexEnrichedField =
  | 'playCount'
  | 'lastWatchedAt'
  | 'plexAddedAt'
  | 'studio'
  | 'runtimeMinutes'
  | 'fileSizeBytes'
  | 'releaseDate'
  | 'fileContainer'
  | 'videoCodec'
  | 'audioCodec'
  | 'fileResolution'
  | 'labels';

export function plexEnricher(plex: PlexProvider): MediaEnricher<PlexEnrichedField> {
  return {
    enrich: async (items): Promise<EnrichmentResult<PlexEnrichedField>> => {
      const fieldsByKey = await plex.readReportedFacts();
      return {
        provider: MetadataProviderType.PLEX,
        items: decorate(items, (i) => i._sourceIds.plex, fieldsByKey),
      };
    },
  };
}

type JellyfinEnrichedField =
  | 'playCount'
  | 'lastWatchedAt'
  | 'jellyfinAddedAt'
  | 'studio'
  | 'runtimeMinutes'
  | 'fileSizeBytes'
  | 'releaseDate'
  | 'fileContainer'
  | 'videoCodec'
  | 'audioCodec'
  | 'fileResolution'
  | 'labels'
  | 'isFavorite';

export function jellyfinEnricher(jellyfin: JellyfinProvider): MediaEnricher<JellyfinEnrichedField> {
  return {
    enrich: async (items): Promise<EnrichmentResult<JellyfinEnrichedField>> => {
      const fieldsByKey = await jellyfin.readReportedFacts();
      return {
        provider: MetadataProviderType.JELLYFIN,
        items: decorate(items, (i) => i._sourceIds.jellyfin, fieldsByKey),
      };
    },
  };
}

export function seerrEnricher(
  seerr: SeerrProvider
): MediaEnricher<'seerrRequestStatus' | 'seerrHasIssue'> {
  return {
    enrich: async (items): Promise<EnrichmentResult<'seerrRequestStatus' | 'seerrHasIssue'>> => {
      const fieldsByKey = await seerr.readReportedFacts();
      return {
        provider: MetadataProviderType.SEERR,
        items: decorate(items, (i) => i._sourceIds.tmdb, fieldsByKey),
      };
    },
  };
}

export function tmdbEnricher(tmdb: TmdbProvider): MediaEnricher<'tmdbStatus'> {
  return {
    enrich: async (items): Promise<EnrichmentResult<'tmdbStatus'>> => {
      const fieldsByKey = new Map<number, Pick<ReportedFacts, 'tmdbStatus'>>();
      for (const item of items) {
        const tmdbId = item._sourceIds.tmdb;
        if (tmdbId === undefined || fieldsByKey.has(tmdbId)) continue;
        const status = await tmdb.getStatus(tmdbId);
        if (status !== undefined)
          fieldsByKey.set(tmdbId, tmdbFieldSource.toEnrichmentFields(status));
      }
      return {
        provider: MetadataProviderType.TMDB,
        items: decorate(items, (i) => i._sourceIds.tmdb, fieldsByKey),
      };
    },
  };
}

export function tautulliEnricher(
  tautulli: TautulliProvider
): MediaEnricher<'playCount' | 'lastWatchedAt'> {
  return {
    enrich: async (items): Promise<EnrichmentResult<'playCount' | 'lastWatchedAt'>> => {
      const fieldsByKey = await tautulli.readReportedFacts();
      return {
        provider: MetadataProviderType.TAUTULLI,
        items: decorate(items, (i) => i._sourceIds.plex, fieldsByKey),
      };
    },
  };
}
