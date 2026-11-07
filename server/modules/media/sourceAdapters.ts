import {
  type RadarrMovie,
  RadarrProvider,
  type SonarrProvider,
  type SonarrSeries,
} from '../providers';
import type { MediaSource } from './mediaSource';
import { normalizeRadarrMovie, normalizeSonarrSeries } from './normalizeMedia';

/** A source over a Radarr connection: each read fetches the library, then binds it as rows. */
export function radarrMediaSource(radarr: RadarrProvider, providerId: number): MediaSource {
  const { idOf } = radarrRowsSource([], providerId);
  return {
    getMediaItems: async () =>
      radarrRowsSource(await radarr.getMovies(), providerId).getMediaItems(),
    idOf,
  };
}

/** A source over a Sonarr connection: each read fetches the library, then binds it as rows. */
export function sonarrMediaSource(sonarr: SonarrProvider, providerId: number): MediaSource {
  const { idOf } = sonarrRowsSource([], providerId);
  return {
    getMediaItems: async () =>
      sonarrRowsSource(await sonarr.getSeries(), providerId).getMediaItems(),
    idOf,
  };
}

export function mediaSourceFor(
  provider: RadarrProvider | SonarrProvider,
  providerId: number
): MediaSource {
  return provider instanceof RadarrProvider
    ? radarrMediaSource(provider, providerId)
    : sonarrMediaSource(provider, providerId);
}

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
