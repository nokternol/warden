UPDATE `media_queries` SET `contentType` = 'series' WHERE `contentType` = 'show';
--> statement-breakpoint
DROP INDEX IF EXISTS `ux_media_identity_show_tvdb`;
--> statement-breakpoint
DROP INDEX IF EXISTS `ux_media_identity_series_tvdb`;
--> statement-breakpoint
UPDATE `media_identity` SET `kind` = 'series' WHERE `kind` = 'show';
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_media_identity_series_tvdb` ON `media_identity`(`tvdbId`) WHERE `kind` = 'series' AND `tvdbId` IS NOT NULL;
