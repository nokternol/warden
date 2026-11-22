import type { ProviderTypeDescriptor } from '@contract/providers';
import type { ContentType } from '@contract/schemas';
import type { MetadataProviderType } from '@server/database/schema';
import type { ProviderKind, ReportedFactKey } from './facts';
import { PROVIDER_CLASSES } from './providerClasses';
import type { AddressColumn, ProviderTypeEntry, TitleIdColumn } from './roles';

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

/** Each provider type with its declared capabilities, in display order. */
const DECLARED = (
  Object.entries(PROVIDER_CATALOGUE) as [MetadataProviderType, ProviderTypeEntry][]
).map(([type, entry]) => ({ type, ...entry.capabilities }));

/**
 * The provider type that owns each content type's catalog: the one declaring `source` for it.
 * Exactly one type per content type declares it (north-star belief 9's current rule).
 */
export const SOURCE_OWNER = Object.fromEntries(
  DECLARED.flatMap(({ type, source }) => (source ? [[source, type]] : []))
) as Record<ContentType, MetadataProviderType>;

/**
 * The title id column each non-source actuator addresses items by: the column it is the media
 * server for, or the one it is declared to be addressed by (Tautulli reports entirely against
 * Plex rating keys, so it shares Plex's column).
 */
export const ADDRESS_COLUMN_BY_TYPE: Partial<Record<MetadataProviderType, AddressColumn>> =
  Object.fromEntries(
    DECLARED.flatMap(({ type, mediaServer, addressedBy }) => {
      const column = mediaServer ?? addressedBy;
      return column ? [[type, column]] : [];
    })
  );

/** The media server whose `links` refresh writes each address column. */
export const MEDIA_SERVER_BY_COLUMN = Object.fromEntries(
  DECLARED.flatMap(({ type, mediaServer }) => (mediaServer ? [[mediaServer, type]] : []))
) as Record<AddressColumn, MetadataProviderType>;

/** Whether a provider type is a media server titles link into (declares `mediaServer`). */
export function isMediaServerType(type: MetadataProviderType): boolean {
  return PROVIDER_CATALOGUE[type].capabilities.mediaServer !== undefined;
}

/** Whether a provider type owns a media catalog (declares `source`). */
export function isMediaSourceType(type: MetadataProviderType): boolean {
  return contentTypeOfSourceType(type) !== undefined;
}

/** The content type a catalog-owning provider type owns, if any. */
export function contentTypeOfSourceType(type: MetadataProviderType): ContentType | undefined {
  return PROVIDER_CATALOGUE[type].capabilities.source;
}

/** Every provider type whose declaration reports `fact`, in display order. */
export function reportersOf(fact: ReportedFactKey): MetadataProviderType[] {
  return DECLARED.filter(({ facts }) => facts?.reports.includes(fact)).map(({ type }) => type);
}

/**
 * The kind of fact reporter a type is: a media server by being one, otherwise the kind it
 * declares. Derivation wins, so a media server's declared kind is never read.
 */
export function providerKindOf(type: MetadataProviderType): ProviderKind | undefined {
  const { mediaServer, providerKind } = PROVIDER_CATALOGUE[type].capabilities;
  return mediaServer ? 'mediaServer' : providerKind;
}

/**
 * The title id column a reporting type's answers are matched by: its address column, or the one
 * its `facts` declaration names. Undefined for a type that reports no facts.
 */
export function titleIdColumnOf(type: MetadataProviderType): TitleIdColumn | undefined {
  const { facts } = PROVIDER_CATALOGUE[type].capabilities;
  return facts ? (ADDRESS_COLUMN_BY_TYPE[type] ?? facts.matchedBy) : undefined;
}

/** Whether a provider type reports facts about titles (declares `facts`). */
export function reportsFacts(type: MetadataProviderType): boolean {
  return PROVIDER_CATALOGUE[type].capabilities.facts !== undefined;
}
