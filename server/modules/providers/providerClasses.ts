import { MetadataProviderType } from '@server/database/schema';
import { JellyfinProvider } from './connections/jellyfinProvider';
import { OmdbProvider } from './connections/omdbProvider';
import { PlexProvider } from './connections/plexProvider';
import { RadarrProvider } from './connections/radarrProvider';
import { SeerrProvider } from './connections/seerrProvider';
import { SonarrProvider } from './connections/sonarrProvider';
import { TautulliProvider } from './connections/tautulliProvider';
import { TmdbProvider } from './connections/tmdbProvider';
import { TvMazeProvider } from './connections/tvmazeProvider';

/** The one map from provider type to its connection class, in display order. */
export const PROVIDER_CLASSES = {
  [MetadataProviderType.PLEX]: PlexProvider,
  [MetadataProviderType.JELLYFIN]: JellyfinProvider,
  [MetadataProviderType.RADARR]: RadarrProvider,
  [MetadataProviderType.SONARR]: SonarrProvider,
  [MetadataProviderType.TAUTULLI]: TautulliProvider,
  [MetadataProviderType.SEERR]: SeerrProvider,
  [MetadataProviderType.TMDB]: TmdbProvider,
  [MetadataProviderType.OMDB]: OmdbProvider,
  [MetadataProviderType.TVMAZE]: TvMazeProvider,
};
