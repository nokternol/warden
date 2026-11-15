-- Facts are stored per provider, as each provider reported them; precedence picks one value when
-- the library cache loads. Existing facts carry no provider, so they are deleted: the next
-- enrichment run reads every enricher again. The per-title enrichment time goes with the 24-hour
-- staleness window it served: each provider's `facts` refresh record says when its facts were read.
DROP TABLE `media_enrichment`;
--> statement-breakpoint
CREATE TABLE `media_enrichment` (
  `id`               INTEGER PRIMARY KEY AUTOINCREMENT,
  `mediaIdentityId`  INTEGER NOT NULL REFERENCES `media_identity`(`id`) ON DELETE CASCADE,
  `fieldId`          INTEGER NOT NULL REFERENCES `enrichment_field`(`id`) ON DELETE CASCADE,
  `providerId`       INTEGER NOT NULL REFERENCES `metadata_provider`(`id`) ON DELETE CASCADE,
  `value`            TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_media_enrichment_identity_field_provider` ON `media_enrichment`(`mediaIdentityId`, `fieldId`, `providerId`);
--> statement-breakpoint
CREATE INDEX `idx_media_enrichment_provider` ON `media_enrichment`(`providerId`);
--> statement-breakpoint
ALTER TABLE `media_identity` DROP COLUMN `enrichedAt`;
