import { MetadataProviderType } from '../../../database/schema';
import type {
  JellyfinProvider,
  PlexProvider,
  SeerrProvider,
  TautulliProvider,
  TmdbProvider,
} from '../../providers';
import type { EnrichmentFields, MediaFieldProvider } from '../mediaFieldProvider';
import {
  jellyfinFieldProvider,
  overseerrFieldProvider,
  plexFieldProvider,
  tautulliFieldProvider,
  tmdbFieldSource,
} from '../mediaFieldProvider';
import { decorate } from './decorate';
import type { EnrichmentResult, MediaEnricher } from './enricher';

/** Runs a `MediaFieldProvider`'s two-step visit→transform pipeline over one raw payload. */
function toFieldsByKey<
  TRaw,
  TMediaField,
  TFields extends Partial<EnrichmentFields>,
  TKey extends string | number,
>(provider: MediaFieldProvider<TRaw, TMediaField, TFields, TKey>, raw: TRaw): Map<TKey, TFields> {
  return new Map(
    [...provider.visit(raw)].map(([key, native]) => [key, provider.toEnrichmentFields(native)])
  );
}

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
      const fieldsByKey = toFieldsByKey(plexFieldProvider, await plex.getAllItems());
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
      const fieldsByKey = toFieldsByKey(jellyfinFieldProvider, await jellyfin.getAllItems());
      return {
        provider: MetadataProviderType.JELLYFIN,
        items: decorate(items, (i) => i._sourceIds.jellyfin, fieldsByKey),
      };
    },
  };
}

export function overseerrEnricher(
  overseerr: SeerrProvider
): MediaEnricher<'overseerrRequestStatus' | 'overseerrHasIssue'> {
  return {
    enrich: async (
      items
    ): Promise<EnrichmentResult<'overseerrRequestStatus' | 'overseerrHasIssue'>> => {
      const [requests, issues] = await Promise.all([
        overseerr.getRequests(),
        overseerr.getIssues(),
      ]);
      const fieldsByKey = toFieldsByKey(overseerrFieldProvider, [requests, issues]);
      return {
        provider: MetadataProviderType.OVERSEERR,
        items: decorate(items, (i) => i._sourceIds.tmdb, fieldsByKey),
      };
    },
  };
}

export function tmdbEnricher(tmdb: TmdbProvider): MediaEnricher<'tmdbStatus'> {
  return {
    enrich: async (items): Promise<EnrichmentResult<'tmdbStatus'>> => {
      const fieldsByKey = new Map<number, Pick<EnrichmentFields, 'tmdbStatus'>>();
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
      const fieldsByKey = toFieldsByKey(tautulliFieldProvider, await tautulli.getHistory());
      return {
        provider: MetadataProviderType.TAUTULLI,
        items: decorate(items, (i) => i._sourceIds.plex, fieldsByKey),
      };
    },
  };
}
