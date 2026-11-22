/**
 * Compile-time check, enforced by `yarn typecheck:server`: the class map refuses a connection class
 * that declares a capability without implementing the role interface it requires. Never run.
 */
import { MetadataProviderType } from '@server/database/schema';
import { BaseProviderConnection } from '@server/modules/providers/connections/baseProviderConnection';
import { defineProviderClasses } from '@server/modules/providers/providerClasses';
import type { ProviderTypeEntry } from '@server/modules/providers/roles';

/** Declares it owns the movie catalog, but cannot read it: no `getMovies`. */
class MovieSourceWithoutMovies extends BaseProviderConnection {
  static readonly catalogueEntry = {
    label: 'Unreadable',
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:1',
    apiPath: '',
    capabilities: { source: 'movie' },
  } as const satisfies ProviderTypeEntry;

  async testConnection(): Promise<void> {}

  getTags = async () => [];
  getProfiles = async () => [];
  getRootFolders = async () => [];
}

// @ts-expect-error a class declaring `source: 'movie'` must construct a MovieSource
defineProviderClasses({ [MetadataProviderType.RADARR]: MovieSourceWithoutMovies });

/** Hosted (no host to enter) but with no `defaultUrl`, so nothing says where it is reached. */
export const hostedWithoutAddress = {
  label: 'Nowhere',
  apiKeyRequired: false,
  apiPath: '',
  capabilities: {},
  // @ts-expect-error an entry without a host placeholder must carry its `defaultUrl`
} as const satisfies ProviderTypeEntry;

/** A reporter's address, presentation and fact reading, shared by the fixtures below. */
const reporterEntry = {
  label: 'Reporter',
  apiKeyRequired: true,
  hostPlaceholder: 'http://localhost:1',
  apiPath: '',
} as const;

/** Declares the facts it reports, but cannot read them: no `readReportedFacts`. */
class ReporterWithoutReading extends BaseProviderConnection {
  static readonly catalogueEntry = {
    ...reporterEntry,
    capabilities: {
      providerKind: 'metadata',
      facts: { reports: ['tmdbStatus'], matchedBy: 'tmdbId' },
    },
  } as const satisfies ProviderTypeEntry;

  async testConnection(): Promise<void> {}
}

// @ts-expect-error a class declaring `facts` must construct a FactReporter
defineProviderClasses({ [MetadataProviderType.TMDB]: ReporterWithoutReading });

/** Reports facts, but neither is a media server nor declares its kind, so no precedence ranks it. */
class ReporterOfNoKind extends BaseProviderConnection {
  static readonly catalogueEntry = {
    ...reporterEntry,
    capabilities: { facts: { reports: ['tmdbStatus'], matchedBy: 'tmdbId' } },
  } as const satisfies ProviderTypeEntry;

  async testConnection(): Promise<void> {}
  readReportedFacts = async () => new Map();
}

// @ts-expect-error a class declaring `facts` must resolve to a kind
defineProviderClasses({ [MetadataProviderType.TMDB]: ReporterOfNoKind });

/** Reports facts, but has no address column and names no title id to match its answers by. */
class ReporterMatchedByNothing extends BaseProviderConnection {
  static readonly catalogueEntry = {
    ...reporterEntry,
    capabilities: { providerKind: 'metadata', facts: { reports: ['tmdbStatus'] } },
  } as const satisfies ProviderTypeEntry;

  async testConnection(): Promise<void> {}
  readReportedFacts = async () => new Map();
}

// @ts-expect-error a class declaring `facts` must resolve to a title id column
defineProviderClasses({ [MetadataProviderType.TMDB]: ReporterMatchedByNothing });
