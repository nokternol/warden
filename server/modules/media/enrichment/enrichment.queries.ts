import type { ContentType } from '@contract/schemas';
import { eq } from 'drizzle-orm';
import { enrichmentField, mediaEnrichment, mediaIdentity } from '../../../database/schema';
import type { DrizzleDb } from '../../../kernel/db';
import type { EnrichmentFields } from '../mediaFieldProvider';

interface Deps {
  db: DrizzleDb;
}

/**
 * The DAL seam behind the EAV media_enrichment shape — the one place that
 * pivots (mediaIdentityId, fieldId, value) rows into/out of the
 * EnrichmentFields object shape every consumer works with.
 */
/** One fact one provider reported about one title. */
export interface StoredFact {
  mediaIdentityId: number;
  providerId: number;
  field: keyof EnrichmentFields;
  value: unknown;
}

export class EnrichmentQueries {
  constructor(private deps: Deps) {}

  /** Every stored fact, with the provider that reported it. */
  async allFacts(): Promise<StoredFact[]> {
    const rows = await this.deps.db
      .select({
        mediaIdentityId: mediaEnrichment.mediaIdentityId,
        providerId: mediaEnrichment.providerId,
        field: enrichmentField.key,
        value: mediaEnrichment.value,
      })
      .from(mediaEnrichment)
      .innerJoin(enrichmentField, eq(enrichmentField.id, mediaEnrichment.fieldId))
      .orderBy(mediaEnrichment.id);
    return rows.map((row) => ({
      ...row,
      field: row.field as keyof EnrichmentFields,
      value: JSON.parse(row.value),
    }));
  }

  /** The fields at least one title of each content type holds a value for, in one query. */
  async fieldsWithValues(): Promise<Record<ContentType, Set<keyof EnrichmentFields>>> {
    const rows = await this.deps.db
      .selectDistinct({ contentType: mediaIdentity.contentType, key: enrichmentField.key })
      .from(mediaEnrichment)
      .innerJoin(enrichmentField, eq(enrichmentField.id, mediaEnrichment.fieldId))
      .innerJoin(mediaIdentity, eq(mediaIdentity.id, mediaEnrichment.mediaIdentityId));
    const fields: Record<ContentType, Set<keyof EnrichmentFields>> = {
      movie: new Set(),
      series: new Set(),
    };
    for (const { contentType, key } of rows) {
      fields[contentType]?.add(key as keyof EnrichmentFields);
    }
    return fields;
  }

  /**
   * Replaces every fact one provider reported with `factsByTitle`, in one batch so a reader never
   * sees the provider's facts half gone. A title or field the provider no longer reports loses its
   * fact from that provider; other providers' facts are untouched.
   */
  async replaceProviderFacts(
    providerId: number,
    factsByTitle: Map<number, Partial<EnrichmentFields>>
  ): Promise<void> {
    const fieldRows = await this.deps.db.select().from(enrichmentField);
    const fieldIdByKey = new Map(fieldRows.map((f) => [f.key, f.id]));
    const rows = [...factsByTitle.entries()].flatMap(([mediaIdentityId, facts]) =>
      Object.entries(facts)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
          const fieldId = fieldIdByKey.get(key);
          // A key EnrichmentFields declares but enrichment_field has no seeded row for is
          // migration/EnrichmentFields drift (docs/architecture/media-enrichment-eav-model.md's
          // accepted, documented risk): fail loudly rather than as an opaque constraint error.
          if (fieldId === undefined) {
            throw new Error(
              `enrichment_field has no seeded row for: ${key} — migration seed is out of sync with EnrichmentFields`
            );
          }
          return { mediaIdentityId, fieldId, providerId, value: JSON.stringify(value) };
        })
    );
    const removeExisting = this.deps.db
      .delete(mediaEnrichment)
      .where(eq(mediaEnrichment.providerId, providerId));
    const batches = [];
    for (let i = 0; i < rows.length; i += 500) {
      batches.push(this.deps.db.insert(mediaEnrichment).values(rows.slice(i, i + 500)));
    }
    await this.deps.db.batch([removeExisting, ...batches]);
  }
}
