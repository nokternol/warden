import { type Freshness, type RefreshRecord, freshnessOf } from '@contract/media';

const KIND_NOUN: Record<Freshness['stale'][number]['kind'], string> = {
  catalog: 'library',
  links: 'links',
  lists: 'lists',
  facts: 'data',
};

const AS_OF = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** How one stale record reads: what failed, or what has never been refreshed. */
function staleText({ provider, kind, failed }: Freshness['stale'][number]): string {
  return failed
    ? `${provider}'s ${KIND_NOUN[kind]} failed to refresh`
    : `${provider}'s ${KIND_NOUN[kind]} not refreshed yet`;
}

/**
 * The one line every view of library data shows: how current the copy it answers from is, and
 * which providers failed their last refresh or have never refreshed. Never claims fresher data
 * than the copy's stalest successful refresh. A view passes the refresh records it answered with;
 * run history passes the freshness its run recorded.
 */
export default function AsOfLine(
  props: { records: readonly RefreshRecord[] } | { freshness: Freshness }
) {
  const freshness = 'records' in props ? freshnessOf(props.records) : props.freshness;
  const asOf =
    freshness.asOf === null
      ? 'Not refreshed yet'
      : `As of ${AS_OF.format(new Date(freshness.asOf * 1000))}`;
  const stale = freshness.stale.map(staleText);
  const failed = freshness.stale.some((s) => s.failed);
  return (
    <p
      role="status"
      aria-label="How current this is"
      className={`text-xs ${failed ? 'text-warning' : 'text-text-muted'}`}
    >
      {[asOf, ...stale].join(' · ')}
    </p>
  );
}
