import type { ReportedFacts } from '../providers';

export const tmdbFieldSource = {
  toEnrichmentFields: (status: string): Pick<ReportedFacts, 'tmdbStatus'> => ({
    tmdbStatus: status,
  }),
};
