-- Reported facts are named for what they mean, not for the product that reports them. Each key
-- is renamed in place: stored values reference their field by id, so every value is kept and the
-- refresh records stay true. The two media servers' added dates become one fact: Jellyfin's rows
-- are re-pointed at the renamed Plex field (the unique index includes the provider, so nothing
-- collides), then its own field row is deleted. Nothing relies on ON DELETE CASCADE: the migrator
-- runs with foreign keys off. Saved filters are not rewritten.
UPDATE `enrichment_field` SET `key` = 'requestStatus' WHERE `key` = 'seerrRequestStatus';
--> statement-breakpoint
UPDATE `enrichment_field` SET `key` = 'hasIssue' WHERE `key` = 'seerrHasIssue';
--> statement-breakpoint
UPDATE `enrichment_field` SET `key` = 'productionStatus' WHERE `key` = 'tmdbStatus';
--> statement-breakpoint
UPDATE `enrichment_field` SET `key` = 'addedToMediaServerAt' WHERE `key` = 'plexAddedAt';
--> statement-breakpoint
UPDATE `media_enrichment`
SET `fieldId` = (SELECT `id` FROM `enrichment_field` WHERE `key` = 'addedToMediaServerAt')
WHERE `fieldId` = (SELECT `id` FROM `enrichment_field` WHERE `key` = 'jellyfinAddedAt');
--> statement-breakpoint
DELETE FROM `enrichment_field` WHERE `key` = 'jellyfinAddedAt';
