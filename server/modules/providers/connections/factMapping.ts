import type { ReportedFacts } from '../facts';

/**
 * What each reporting connection's `readReportedFacts` shares when it translates its own payload
 * into reported facts.
 */

/** Drops the keys whose value is undefined, so a fact the provider did not report is absent. */
export function defined<T extends object>(facts: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/** A unix timestamp in seconds, as an ISO date. */
export const isoFromUnix = (unix: number): string => new Date(unix * 1000).toISOString();

/**
 * The play-history facts from the shape Plex and Tautulli both report: a play count and the last
 * play as a unix timestamp. A title with no timed play has no last-watched fact.
 */
export function playHistoryFacts(
  playCount: number,
  lastPlayedUnix: number | undefined
): Partial<Pick<ReportedFacts, 'playCount' | 'lastWatchedAt'>> {
  return {
    playCount,
    ...(lastPlayedUnix !== undefined ? { lastWatchedAt: isoFromUnix(lastPlayedUnix) } : {}),
  };
}
