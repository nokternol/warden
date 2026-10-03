import type { MediaItem, MediaItemSet } from './mediaItem';

/**
 * The read role a media-owning provider plays for the query engine. A source
 * advertises normalized "media items" — not movies or series — carrying their own
 * provenance (`_sourceIds.providerId`), and projects each item back to its
 * provider-native id. `RadarrProvider` serves movies and `SonarrProvider` serves
 * series, but the engine consumes only this role and never sees that distinction.
 */
export interface MediaSource {
  getMediaItems(): Promise<MediaItemSet>;
  idOf(item: MediaItem): number | undefined;
}
