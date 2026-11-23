/**
 * Compile-time check, enforced by `yarn typecheck:server`: a catalog record may not hold a key that
 * is also a reported fact. Never run.
 */
import type { NoReportedFacts } from '@server/modules/media/mediaItem';

/** A catalog record that also carries play count, a fact the media servers report. */
interface RecordReportingPlayCount {
  title: string;
  playCount: number;
}

// @ts-expect-error a catalog record key that is also a reported fact key does not compile
export const collides: NoReportedFacts<RecordReportingPlayCount> = {};
