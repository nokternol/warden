import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { MediaProfile, MediaTag } from '@contract/media';

export type { MediaTag };
export type MediaQualityProfile = MediaProfile;

export function useMediaLookups() {
  const { data: tagsData } = useApi(api.media.tags, undefined);
  const { data: profilesData } = useApi(api.media.qualityProfiles, undefined);
  const { data: genresData } = useApi(api.media.genres, undefined);
  const { data: networksData } = useApi(api.media.networks, undefined);
  const { data: studioData } = useApi(api.media.studio, undefined);
  const { data: releaseGroupsData } = useApi(api.media.releaseGroups, undefined);
  const { data: collectionNamesData } = useApi(api.media.collectionNames, undefined);
  const { data: languageProfilesData } = useApi(api.media.languageProfiles, undefined);
  const { data: fileContainersData } = useApi(api.media.fileContainers, undefined);
  const { data: videoCodecsData } = useApi(api.media.videoCodecs, undefined);
  const { data: audioCodecsData } = useApi(api.media.audioCodecs, undefined);
  const { data: fileResolutionsData } = useApi(api.media.fileResolutions, undefined);
  const { data: labelsData } = useApi(api.media.labels, undefined);

  return {
    tags: {
      radarr: tagsData?.radarr ?? [],
      sonarr: tagsData?.sonarr ?? [],
    },
    qualityProfiles: {
      radarr: profilesData?.radarr ?? [],
      sonarr: profilesData?.sonarr ?? [],
    },
    genres: {
      movies: genresData?.movies ?? [],
      series: genresData?.series ?? [],
    },
    networks: networksData ?? [],
    studio: studioData ?? [],
    releaseGroups: releaseGroupsData ?? [],
    collectionNames: collectionNamesData ?? [],
    languageProfiles: languageProfilesData ?? [],
    fileContainers: fileContainersData ?? [],
    videoCodecs: videoCodecsData ?? [],
    audioCodecs: audioCodecsData ?? [],
    fileResolutions: fileResolutionsData ?? [],
    labels: labelsData ?? [],
  };
}
