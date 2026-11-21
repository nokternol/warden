import { z } from 'zod';
import type { ContentType } from './schemas';

/**
 * Every reason a filter list cannot be trusted to select the titles it describes. Filter
 * readiness on the server is the only place these are raised; every screen reads them.
 */
export const READINESS_KINDS = [
  'no-library',
  'no-provider',
  'unknown-rule',
  'inactive-instance',
  'data-incomplete',
  'no-data',
] as const;

export type ReadinessKind = (typeof READINESS_KINDS)[number];

/**
 * Findings that say how complete the data is rather than that a filter cannot work. They never
 * stop a schedule or Run Now and leave the query list clear; screens show them only through the
 * copy's "As of" line, which names the provider.
 */
export const INFORMATIONAL_KINDS: readonly ReadinessKind[] = ['data-incomplete'];

export function isInformational(finding: Pick<ReadinessFinding, 'kind'>): boolean {
  return INFORMATIONAL_KINDS.includes(finding.kind);
}

export const ReadinessFindingSchema = z
  .object({
    /** Deterministic from the facts that make the finding, so the same problem keeps its id. */
    id: z.string(),
    kind: z.enum(READINESS_KINDS),
    queryId: z.number().optional(),
    ruleKey: z.string().optional(),
    providerIds: z.array(z.number()),
    message: z.string(),
    /** What makes the finding go away, said to the user. */
    clears: z.string(),
  })
  .strict();

export type ReadinessFinding = z.infer<typeof ReadinessFindingSchema>;

/** A provider instance as a finding names it: its type's label, when the instance still exists. */
export interface NamedInstance {
  id: number;
  typeLabel?: string;
}

/** What a finding's sentence is written from. Labels are resolved by the server. */
export type FindingDescription =
  | { kind: 'no-library'; contentType: ContentType; sourceLabel: string }
  | { kind: 'no-provider'; ruleLabel: string; producerLabels: string[]; offered: boolean }
  | { kind: 'unknown-rule'; ruleKey: string }
  | {
      kind: 'inactive-instance';
      ruleLabel: string;
      instance: NamedInstance;
      /** Set when the instance is active but is not a source of the query's content type. */
      expectedLabel?: string;
    }
  | { kind: 'data-incomplete'; ruleLabel: string }
  | { kind: 'no-data'; ruleLabel: string; contentType: ContentType };

/** "Radarr instance 3", or "Provider instance 3" for an instance that no longer exists. */
export function instanceName({ id, typeLabel }: NamedInstance): string {
  return `${typeLabel ?? 'Provider'} instance ${id}`;
}

/** "Plex, Jellyfin or Tautulli". */
function either(labels: string[]): string {
  return labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
    : (labels[0] ?? '');
}

const NOUN: Record<ContentType, string> = { movie: 'movie', series: 'series' };

/**
 * A query can't be edited, and one an automation uses can't be deleted, so a filter is changed by
 * deleting the automations that use its query, then the query, and recreating both.
 */
const WITHOUT_FILTER = 'the query without this filter, and any automation that uses it.';
const RECREATE = `Recreate ${WITHOUT_FILTER}`;

/** The one wording of every finding: what is wrong, and what makes it go away. */
export function describeFinding(description: FindingDescription): {
  message: string;
  clears: string;
} {
  switch (description.kind) {
    case 'no-library':
      return {
        message: `There is no ${NOUN[description.contentType]} library: no ${description.sourceLabel} provider is active`,
        clears: `Activate a ${description.sourceLabel} provider.`,
      };
    case 'no-provider': {
      const producers = either(description.producerLabels);
      return description.offered
        ? {
            message: `${description.ruleLabel} filter needs a ${producers} provider, and none is active`,
            clears: `Activate a ${producers} provider.`,
          }
        : {
            message: `${description.ruleLabel} filter needs a ${producers} provider, which Warden does not offer`,
            clears: RECREATE,
          };
    }
    case 'unknown-rule':
      return {
        message: `A filter names a rule that no longer exists: ${description.ruleKey}`,
        clears: RECREATE,
      };
    case 'inactive-instance': {
      const named = `${description.ruleLabel} filter names ${instanceName(description.instance)}`;
      if (description.expectedLabel) {
        return {
          message: `${named}, which is not a ${description.expectedLabel} provider`,
          clears: `Recreate the query naming a ${description.expectedLabel} instance, and any automation that uses it.`,
        };
      }
      return {
        message: `${named}, which is not an active provider`,
        clears: description.instance.typeLabel
          ? `Activate ${instanceName(description.instance)}, or recreate ${WITHOUT_FILTER}`
          : RECREATE,
      };
    }
    case 'data-incomplete':
      return {
        message: `${description.ruleLabel} filter's data is incomplete: a provider that supplies it has not refreshed`,
        clears: 'Clears when that provider next refreshes successfully.',
      };
    case 'no-data':
      return {
        message: `${description.ruleLabel} filter has no data: no ${NOUN[description.contentType]} holds a value for it`,
        clears:
          'Clears when a title gets a value. If it is empty on purpose, an automation relying on this filter needs it signed off on the Automations page before its schedule runs.',
      };
  }
}
