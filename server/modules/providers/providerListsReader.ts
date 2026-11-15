import type { ProviderListsData } from './providerLists';

/**
 * Reads one provider's stored lists. Declared here and implemented by the library cache in
 * `media`, which holds the copy; the providers procedures read task parameter choices through it,
 * so they never read a provider live.
 */
export interface ProviderListsReader {
  listsOf(providerId: number): Promise<ProviderListsData | undefined>;
}
