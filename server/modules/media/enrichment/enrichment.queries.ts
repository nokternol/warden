import { eq, inArray, sql } from 'drizzle-orm';
import { enrichmentField, mediaEnrichment } from '../../../database/schema';
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
export class EnrichmentQueries {
  constructor(private deps: Deps) {}

  /** Whether any title holds a value for this field, so its absence on one title means something. */
  async hasValues(field: keyof EnrichmentFields): Promise<boolean> {
    const [row] = await this.deps.db
      .select({ id: mediaEnrichment.fieldId })
      .from(mediaEnrichment)
      .innerJoin(enrichmentField, eq(enrichmentField.id, mediaEnrichment.fieldId))
      .where(eq(enrichmentField.key, field))
      .limit(1);
    return row !== undefined;
  }

  async getByIdentityIds(ids: number[]): Promise<Map<number, Partial<EnrichmentFields>>> {
    if (ids.length === 0) return new Map();
    const rows = await this.deps.db
      .select({
        mediaIdentityId: mediaEnrichment.mediaIdentityId,
        // `json(me.value)` is load-bearing: me.value is already JSON-encoded
        // text, so without unwrapping it here json_group_object would
        // re-encode it as a JSON string (e.g. the number 3 becomes "3").
        fields: sql<string>`json_group_object(${enrichmentField.key}, json(${mediaEnrichment.value}))`,
      })
      .from(mediaEnrichment)
      .innerJoin(enrichmentField, eq(enrichmentField.id, mediaEnrichment.fieldId))
      .where(inArray(mediaEnrichment.mediaIdentityId, ids))
      .groupBy(mediaEnrichment.mediaIdentityId);

    return new Map(rows.map((row) => [row.mediaIdentityId, JSON.parse(row.fields)]));
  }

  async replaceFields(mediaIdentityId: number, values: Partial<EnrichmentFields>): Promise<void> {
    const keys = Object.keys(values) as (keyof EnrichmentFields)[];
    await this.deps.db
      .delete(mediaEnrichment)
      .where(eq(mediaEnrichment.mediaIdentityId, mediaIdentityId));
    if (keys.length === 0) return;

    const fieldRows = await this.deps.db
      .select()
      .from(enrichmentField)
      .where(inArray(enrichmentField.key, keys));
    const fieldIdByKey = new Map(fieldRows.map((f) => [f.key, f.id]));

    // A key EnrichmentFields declares but enrichment_field has no seeded row for is
    // migration/EnrichmentFields drift (docs/architecture/media-enrichment-eav-model.md's
    // accepted, documented risk) — fail loudly here rather than let a NOT NULL
    // constraint violation on fieldId report it as an opaque SQL error.
    const missingKeys = keys.filter((key) => !fieldIdByKey.has(key));
    if (missingKeys.length > 0) {
      throw new Error(
        `enrichment_field has no seeded row for: ${missingKeys.join(', ')} — migration seed is out of sync with EnrichmentFields`
      );
    }

    await this.deps.db.insert(mediaEnrichment).values(
      keys.flatMap((key) => {
        const fieldId = fieldIdByKey.get(key);
        return fieldId === undefined
          ? []
          : [{ mediaIdentityId, fieldId, value: JSON.stringify(values[key]) }];
      })
    );
  }
}
