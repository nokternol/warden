import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { MediaProfile, MediaTag } from '@contract/media';

export type { MediaTag };
export type MediaQualityProfile = MediaProfile;

/** Just the instance data that names a saved filter's ids, flattened across providers. */
export function useFilterSummaryLookups() {
  const { data: tags } = useApi(api.media.tags, undefined);
  const { data: profiles } = useApi(api.media.qualityProfiles, undefined);
  const { data: languageProfiles } = useApi(api.media.languageProfiles, undefined);
  return {
    tags: [...(tags?.radarr ?? []), ...(tags?.sonarr ?? [])],
    qualityProfiles: [...(profiles?.radarr ?? []), ...(profiles?.sonarr ?? [])],
    languageProfiles: languageProfiles ?? [],
  };
}

export function useMediaLookups() {
  const tags = useApi(api.media.tags, undefined);
  const profiles = useApi(api.media.qualityProfiles, undefined);
  const genres = useApi(api.media.genres, undefined);
  const networks = useApi(api.media.networks, undefined);
  const studio = useApi(api.media.studio, undefined);
  const releaseGroups = useApi(api.media.releaseGroups, undefined);
  const collectionNames = useApi(api.media.collectionNames, undefined);
  const languageProfiles = useApi(api.media.languageProfiles, undefined);
  const fileContainers = useApi(api.media.fileContainers, undefined);
  const videoCodecs = useApi(api.media.videoCodecs, undefined);
  const audioCodecs = useApi(api.media.audioCodecs, undefined);
  const fileResolutions = useApi(api.media.fileResolutions, undefined);
  const labels = useApi(api.media.labels, undefined);
  const all = [
    tags,
    profiles,
    genres,
    networks,
    studio,
    releaseGroups,
    collectionNames,
    languageProfiles,
    fileContainers,
    videoCodecs,
    audioCodecs,
    fileResolutions,
    labels,
  ];

  return {
    error: all.find((result) => result.error)?.error,
    refresh: () => Promise.all(all.map((result) => result.mutate())),
    tags: {
      radarr: tags.data?.radarr ?? [],
      sonarr: tags.data?.sonarr ?? [],
    },
    qualityProfiles: {
      radarr: profiles.data?.radarr ?? [],
      sonarr: profiles.data?.sonarr ?? [],
    },
    genres: {
      movies: genres.data?.movies ?? [],
      series: genres.data?.series ?? [],
    },
    networks: networks.data ?? [],
    studio: studio.data ?? [],
    releaseGroups: releaseGroups.data ?? [],
    collectionNames: collectionNames.data ?? [],
    languageProfiles: languageProfiles.data ?? [],
    fileContainers: fileContainers.data ?? [],
    videoCodecs: videoCodecs.data ?? [],
    audioCodecs: audioCodecs.data ?? [],
    fileResolutions: fileResolutions.data ?? [],
    labels: labels.data ?? [],
  };
}
