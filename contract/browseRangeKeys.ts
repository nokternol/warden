/**
 * The browse-path range-rule keys, by content type, shared by the server's and
 * the client's browse-param translators.
 *
 * Hand-authored, not derived from `MEDIA_RULES`, because the contract depends on
 * nothing in `server/` — but not free-floating: `filterRegistry.ts` fails to
 * compile if these lists and `MEDIA_RULES`' actual range-dataType rules disagree
 * in either direction, so this file can't silently drift from the registry.
 */
export type MovieRangeRuleKey =
  | 'year'
  | 'addedDaysAgo'
  | 'plexAddedDaysAgo'
  | 'jellyfinAddedDaysAgo'
  | 'sizeOnDiskGb'
  | 'runtimeMinutes'
  | 'fileSizeBytes'
  | 'releaseDaysAgo'
  | 'imdbRating'
  | 'lastWatchedDaysAgo'
  | 'movieFileCount'
  | 'inCinemasDaysAgo'
  | 'physicalReleaseDaysAgo'
  | 'digitalReleaseDaysAgo';

export type ShowRangeRuleKey =
  | 'year'
  | 'addedDaysAgo'
  | 'plexAddedDaysAgo'
  | 'jellyfinAddedDaysAgo'
  | 'sizeOnDiskGb'
  | 'fileSizeBytes'
  | 'releaseDaysAgo'
  | 'communityRating'
  | 'lastAiredDaysAgo'
  | 'episodePercentage'
  | 'lastWatchedDaysAgo'
  | 'seasonCount'
  | 'episodeCount'
  | 'nextAiringInDays';
