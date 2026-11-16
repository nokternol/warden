import type { ProviderTypeDescriptor } from '@contract/providers';
import type { MetadataProviderType } from '@server/database/schema';
import { PROVIDER_CLASSES } from './providerClasses';
import type { ProviderTypeEntry } from './roles';

/**
 * Every provider type Warden knows with its catalogue entry, in display order: each entry is the
 * one its connection class declares, read from the class map.
 */
export const PROVIDER_CATALOGUE = Object.fromEntries(
  Object.entries(PROVIDER_CLASSES).map(([type, connection]): [string, ProviderTypeEntry] => [
    type,
    connection.catalogueEntry,
  ])
) as Record<MetadataProviderType, ProviderTypeEntry>;

/** Each provider type as the setup screens see it, in display order; capabilities stay here. */
export function describeProviderTypes(): ProviderTypeDescriptor[] {
  return (Object.entries(PROVIDER_CATALOGUE) as [MetadataProviderType, ProviderTypeEntry][]).map(
    ([type, { capabilities: _capabilities, filterData, ...entry }]) => ({
      type,
      ...entry,
      filterData: [...filterData],
    })
  );
}

/** How a provider type is named to the user: "Radarr", "TMDB". */
export function providerTypeLabel(type: MetadataProviderType): string {
  return PROVIDER_CATALOGUE[type].label;
}
