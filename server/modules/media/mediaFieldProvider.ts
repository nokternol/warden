import type {
  JellyfinItem,
  JellyfinMediaSource,
  PlexMedia,
  PlexMediaItem,
  SeerrIssue,
  SeerrRequest,
  TautulliHistoryItem,
} from '../providers';

/**
 * The canonical fields any provider may contribute, whether by decorating an
 * existing item (`MediaFieldProvider`) or by constructing one from scratch
 * (`MediaFieldSource`). Hand-authored and type-only — never read or branched
 * on at runtime. Every adapter's `toEnrichmentFields` return is checked
 * against it, which is what catches a field-type disagreement between two
 * providers at compile time.
 */
export interface EnrichmentFields {
  tags: number[];
  playCount: number;
  lastWatchedAt: string;
  seerrRequestStatus: number;
  seerrHasIssue: boolean;
  tmdbStatus: string;
  plexAddedAt: string;
  studio: string;
  runtimeMinutes: number;
  fileSizeBytes: number;
  releaseDate: string;
  fileContainer: string;
  videoCodec: string;
  audioCodec: string;
  fileResolution: string;
  labels: string[];
  jellyfinAddedAt: string;
  isFavorite: boolean;
}

/**
 * A provider that builds an entire canonical item from one raw item, always
 * 1:1, with no existing item to decorate. `toEnrichmentFields` is the single
 * checked transform from the provider's own representation to `TFields`.
 */
export interface MediaFieldSource<TMediaField, TFields extends Partial<EnrichmentFields>> {
  toEnrichmentFields(native: TMediaField): TFields;
}

/**
 * A provider that decorates fields onto an already-existing item, joined by
 * key across a batch. `visit` maps raw provider data into the provider's own
 * native representation, keyed by the logical key the provider speaks;
 * `toEnrichmentFields` is the same checked transform `MediaFieldSource` uses,
 * applied per matched item.
 */
export interface MediaFieldProvider<
  TRaw,
  TMediaField,
  TFields extends Partial<EnrichmentFields>,
  TKey extends string | number = string,
> {
  visit(raw: TRaw): Map<TKey, TMediaField>;
  toEnrichmentFields(native: TMediaField): TFields;
}

/**
 * Both Radarr and Sonarr report tags as a native `number[]` with no
 * transform needed — the same `MediaFieldSource` shape, kept as two named
 * exports (not one shared constant) because callers care which provider's
 * adapter they're wiring, even though today's transform happens to be
 * identical.
 */
const tagsIdentitySource = (tags: number[]): Pick<EnrichmentFields, 'tags'> => ({ tags });

export const radarrTagsFieldSource: MediaFieldSource<number[], Pick<EnrichmentFields, 'tags'>> = {
  toEnrichmentFields: tagsIdentitySource,
};

export const sonarrTagsFieldSource: MediaFieldSource<number[], Pick<EnrichmentFields, 'tags'>> = {
  toEnrichmentFields: tagsIdentitySource,
};

/**
 * The play-history shape Tautulli and Plex both natively report: play count
 * plus the last play as a unix timestamp. Shared because it's genuinely the
 * same representation for both, not merely a coincidence of two adapters.
 */
interface PlayHistoryFields {
  playCount: number;
  lastPlayedUnix?: number;
}

const toIso = (unix: number): string => new Date(unix * 1000).toISOString();

/** The `toEnrichmentFields` transform every play-history provider shares. */
function playHistoryToEnrichmentFields(
  native: PlayHistoryFields
): Partial<Pick<EnrichmentFields, 'playCount' | 'lastWatchedAt'>> {
  return {
    playCount: native.playCount,
    ...(native.lastPlayedUnix !== undefined ? { lastWatchedAt: toIso(native.lastPlayedUnix) } : {}),
  };
}

export const tautulliFieldProvider: MediaFieldProvider<
  TautulliHistoryItem[],
  PlayHistoryFields,
  Partial<Pick<EnrichmentFields, 'playCount' | 'lastWatchedAt'>>
> = {
  visit: (history) => {
    const byKey = new Map<string, PlayHistoryFields>();
    for (const item of history) {
      // A play of an episode is a play of its show, which is what a series is matched by.
      const key =
        item.media_type === 'episode' && item.grandparent_rating_key
          ? item.grandparent_rating_key
          : item.rating_key;
      const existing = byKey.get(key);
      const playCount = (existing?.playCount ?? 0) + 1;
      const lastPlayedUnix =
        item.played_at !== undefined &&
        (existing?.lastPlayedUnix === undefined || item.played_at > existing.lastPlayedUnix)
          ? item.played_at
          : existing?.lastPlayedUnix;
      byKey.set(key, { playCount, lastPlayedUnix });
    }
    return byKey;
  },
  toEnrichmentFields: playHistoryToEnrichmentFields,
};

export const tmdbFieldSource: MediaFieldSource<string, Pick<EnrichmentFields, 'tmdbStatus'>> = {
  toEnrichmentFields: (status) => ({ tmdbStatus: status }),
};

/** Seerr's own representation: request status and whether an issue is open. */
interface SeerrNativeFields {
  requestStatus?: number;
  hasIssue?: boolean;
}

export const seerrFieldProvider: MediaFieldProvider<
  [SeerrRequest[], SeerrIssue[]],
  SeerrNativeFields,
  Partial<Pick<EnrichmentFields, 'seerrRequestStatus' | 'seerrHasIssue'>>,
  number
> = {
  visit: ([requests, issues]) => {
    const byTmdbId = new Map<number, SeerrNativeFields>();
    const get = (tmdbId: number): SeerrNativeFields => {
      let f = byTmdbId.get(tmdbId);
      if (!f) {
        f = {};
        byTmdbId.set(tmdbId, f);
      }
      return f;
    };
    for (const req of requests) get(req.media.tmdbId).requestStatus = req.status;
    for (const issue of issues) get(issue.media.tmdbId).hasIssue = true;
    return byTmdbId;
  },
  toEnrichmentFields: (native) => ({
    ...(native.requestStatus !== undefined ? { seerrRequestStatus: native.requestStatus } : {}),
    ...(native.hasIssue !== undefined ? { seerrHasIssue: native.hasIssue } : {}),
  }),
};

/** The first `Media` entry's first `Part` — the file Plex actually plays, per item. */
function primaryPart(item: PlexMediaItem): { media?: PlexMedia; size?: number } {
  const media = item.Media?.[0];
  return { media, size: media?.Part?.[0]?.size };
}

/** Plex's own representation: play history plus its library-added timestamp and
 *  the rest of the item's directly-owned metadata (studio, runtime, file-tech,
 *  release date, labels). */
interface PlexNativeFields extends PlayHistoryFields {
  addedAtUnix?: number;
  studio?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  releaseDate?: string;
  fileContainer?: string;
  videoCodec?: string;
  audioCodec?: string;
  fileResolution?: string;
  labels?: string[];
}

export const plexFieldProvider: MediaFieldProvider<
  PlexMediaItem[],
  PlexNativeFields,
  Partial<
    Pick<
      EnrichmentFields,
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
      | 'labels'
    >
  >
> = {
  visit: (items) => {
    const byKey = new Map<string, PlexNativeFields>();
    for (const item of items) {
      const { media, size } = primaryPart(item);
      byKey.set(item.ratingKey, {
        playCount: item.viewCount ?? 0,
        lastPlayedUnix: item.lastViewedAt,
        addedAtUnix: item.addedAt,
        studio: item.studio,
        durationMs: item.duration,
        fileSizeBytes: size,
        releaseDate: item.originallyAvailableAt,
        fileContainer: media?.container,
        videoCodec: media?.videoCodec,
        audioCodec: media?.audioCodec,
        fileResolution: media?.videoResolution,
        labels: item.Label?.map((l) => l.tag),
      });
    }
    return byKey;
  },
  toEnrichmentFields: (native) => ({
    ...playHistoryToEnrichmentFields(native),
    ...(native.addedAtUnix !== undefined ? { plexAddedAt: toIso(native.addedAtUnix) } : {}),
    ...(native.studio !== undefined ? { studio: native.studio } : {}),
    ...(native.durationMs !== undefined
      ? { runtimeMinutes: Math.round(native.durationMs / 60_000) }
      : {}),
    ...(native.fileSizeBytes !== undefined ? { fileSizeBytes: native.fileSizeBytes } : {}),
    ...(native.releaseDate !== undefined ? { releaseDate: native.releaseDate } : {}),
    ...(native.fileContainer !== undefined ? { fileContainer: native.fileContainer } : {}),
    ...(native.videoCodec !== undefined ? { videoCodec: native.videoCodec } : {}),
    ...(native.audioCodec !== undefined ? { audioCodec: native.audioCodec } : {}),
    ...(native.fileResolution !== undefined ? { fileResolution: native.fileResolution } : {}),
    ...(native.labels !== undefined && native.labels.length > 0 ? { labels: native.labels } : {}),
  }),
};

/** Discrete resolution tier from a video stream's pixel height — matches Plex's
 *  `videoResolution` string convention (e.g. "1080"), since Jellyfin reports raw
 *  Width/Height rather than a pre-computed tier label. Exported for the
 *  fileResolution lookup route, which needs the identical derivation over raw
 *  Jellyfin items outside the enrichment pipeline. */
export function resolutionTier(height: number | undefined): string | undefined {
  if (height === undefined) return undefined;
  if (height >= 2160) return '2160';
  if (height >= 1080) return '1080';
  if (height >= 720) return '720';
  return 'sd';
}

/** The first `MediaSources` entry's video/audio streams — the file Jellyfin actually
 *  plays, per item, mirroring Plex's `primaryPart`. */
function primaryMediaSource(item: JellyfinItem): {
  source?: JellyfinMediaSource;
  videoCodec?: string;
  audioCodec?: string;
  fileResolution?: string;
} {
  const source = item.MediaSources?.[0];
  const streams = source?.MediaStreams ?? [];
  const videoStream = streams.find((s) => s.Type === 'Video');
  return {
    source,
    videoCodec: videoStream?.Codec,
    audioCodec: streams.find((s) => s.Type === 'Audio')?.Codec,
    fileResolution: resolutionTier(videoStream?.Height),
  };
}

/** Jellyfin's own representation: play history (synthesized from `Played` when
 *  `PlayCount` is absent, per the spec) plus its library-added timestamp, studio,
 *  runtime, file-tech fields, release date, labels, and favorite flag — the same
 *  field set Plex reports, plus the two fields with no Plex analog. */
interface JellyfinNativeFields extends PlayHistoryFields {
  addedAtIso?: string;
  studio?: string;
  runtimeTicks?: number;
  fileSizeBytes?: number;
  releaseDate?: string;
  fileContainer?: string;
  videoCodec?: string;
  audioCodec?: string;
  fileResolution?: string;
  labels?: string[];
  isFavorite?: boolean;
}

const TICKS_PER_MS = 10_000;

export const jellyfinFieldProvider: MediaFieldProvider<
  JellyfinItem[],
  JellyfinNativeFields,
  Partial<
    Pick<
      EnrichmentFields,
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
      | 'isFavorite'
    >
  >
> = {
  visit: (items) => {
    const byKey = new Map<string, JellyfinNativeFields>();
    for (const item of items) {
      const { source, videoCodec, audioCodec, fileResolution } = primaryMediaSource(item);
      const userData = item.UserData;
      // Played is a boolean synthesizing to 0/1 when PlayCount is absent, per spec.
      const playCount = userData?.PlayCount ?? (userData?.Played ? 1 : 0);
      byKey.set(item.Id, {
        playCount,
        lastPlayedUnix: userData?.LastPlayedDate
          ? Date.parse(userData.LastPlayedDate) / 1000
          : undefined,
        addedAtIso: item.DateCreated,
        studio: item.Studios?.[0]?.Name,
        runtimeTicks: item.RunTimeTicks,
        fileSizeBytes: source?.Size,
        releaseDate: item.PremiereDate,
        fileContainer: source?.Container,
        videoCodec,
        audioCodec,
        fileResolution,
        labels: item.Tags,
        isFavorite: userData?.IsFavorite,
      });
    }
    return byKey;
  },
  toEnrichmentFields: (native) => ({
    playCount: native.playCount,
    ...(native.lastPlayedUnix !== undefined ? { lastWatchedAt: toIso(native.lastPlayedUnix) } : {}),
    ...(native.addedAtIso !== undefined ? { jellyfinAddedAt: native.addedAtIso } : {}),
    ...(native.studio !== undefined ? { studio: native.studio } : {}),
    ...(native.runtimeTicks !== undefined
      ? { runtimeMinutes: Math.round(native.runtimeTicks / TICKS_PER_MS / 60_000) }
      : {}),
    ...(native.fileSizeBytes !== undefined ? { fileSizeBytes: native.fileSizeBytes } : {}),
    ...(native.releaseDate !== undefined ? { releaseDate: native.releaseDate } : {}),
    ...(native.fileContainer !== undefined ? { fileContainer: native.fileContainer } : {}),
    ...(native.videoCodec !== undefined ? { videoCodec: native.videoCodec } : {}),
    ...(native.audioCodec !== undefined ? { audioCodec: native.audioCodec } : {}),
    ...(native.fileResolution !== undefined ? { fileResolution: native.fileResolution } : {}),
    ...(native.labels !== undefined && native.labels.length > 0 ? { labels: native.labels } : {}),
    ...(native.isFavorite !== undefined ? { isFavorite: native.isFavorite } : {}),
  }),
};
