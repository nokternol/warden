import type { RadarrMovie, SonarrSeries } from '../providers';
import type { MediaSource } from './mediaSource';
import { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

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
