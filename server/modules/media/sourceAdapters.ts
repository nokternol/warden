import type { ContentType } from '@contract/schemas';
import type { RadarrMovie, SonarrSeries } from '../providers';
import type { MediaSource } from './mediaSource';
import { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';
import type { SourceRead } from './sourceReadCache';

/**
 * A source over Radarr rows already read. Every `getMediaItems()` normalises the rows into new
 * objects, so enrichment one match merges into its items never reaches another match's.
 */
export function radarrRowsSource(rows: RadarrMovie[], providerId: number): MediaSource {
  return {
    getMediaItems: async () => rows.map((m) => normalizeRadarrMovie(m, providerId)),
    idOf: (item) => (item._sourceIds as { radarr?: number }).radarr,
  };
}

/** A source over Sonarr rows already read, normalised into new objects on every read. */
export function sonarrRowsSource(rows: SonarrSeries[], providerId: number): MediaSource {
  return {
    getMediaItems: async () => rows.map((s) => normalizeSonarrSeries(s, providerId)),
    idOf: (item) => (item._sourceIds as { sonarr?: number }).sonarr,
  };
}

/**
 * One instance's read from the `SourceReadCache`, bound with its content type's binder: Radarr rows
 * for movies, Sonarr rows for series. The one place a read's rows are told apart by content type.
 */
export function rowsSourceFor(
  contentType: ContentType,
  { providerId, rows }: SourceRead<ContentType>
): MediaSource {
  return contentType === 'movie'
    ? radarrRowsSource(rows as RadarrMovie[], providerId)
    : sonarrRowsSource(rows as SonarrSeries[], providerId);
}
