import type { SeerrIssue, SeerrRequest, TautulliHistoryItem } from '../providers';
import type { ReportedFacts } from '../providers';

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
  TFields extends Partial<ReportedFacts>,
  TKey extends string | number = string,
> {
  visit(raw: TRaw): Map<TKey, TMediaField>;
  toEnrichmentFields(native: TMediaField): TFields;
}

export const tmdbFieldSource = {
  toEnrichmentFields: (status: string): Pick<ReportedFacts, 'tmdbStatus'> => ({
    tmdbStatus: status,
  }),
};

/** Seerr's own representation: request status and whether an issue is open. */
interface SeerrNativeFields {
  requestStatus?: number;
  hasIssue?: boolean;
}

export const seerrFieldProvider: MediaFieldProvider<
  [SeerrRequest[], SeerrIssue[]],
  SeerrNativeFields,
  Partial<Pick<ReportedFacts, 'seerrRequestStatus' | 'seerrHasIssue'>>,
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
