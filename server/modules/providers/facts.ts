/**
 * The value type, by key, of every fact a non-source provider can report about a title. Owns no
 * data: each reporting connection declares which of these it reports (`capabilities.facts`), and
 * its `readReportedFacts` returns them.
 */
export interface ReportedFacts {
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

/** The key of a reported fact. */
export type ReportedFactKey = keyof ReportedFacts;

/** The kind of a fact reporter, which the reported-fact precedence ranks. Sources are not a kind. */
export type ProviderKind = 'mediaServer' | 'watchHistory' | 'requestManager' | 'metadata';

/**
 * For each reported fact more than one kind of provider reports, those kinds in the order whose
 * value Warden takes (north-star belief 3: the precedence ranks kinds of service, never named
 * services). A watch-history tracker counts completed plays, not opens, so it ranks before a media
 * server. Between two providers of one kind, the first connected wins until the owner chooses.
 */
export const REPORTED_FACT_PRECEDENCE: Partial<Record<ReportedFactKey, readonly ProviderKind[]>> = {
  playCount: ['watchHistory', 'mediaServer'],
  lastWatchedAt: ['watchHistory', 'mediaServer'],
};
