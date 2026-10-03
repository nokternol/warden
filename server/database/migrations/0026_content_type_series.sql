UPDATE `media_queries` SET `contentType` = 'series' WHERE `contentType` = 'show';
--> statement-breakpoint
UPDATE `media_identity` SET `kind` = 'series' WHERE `kind` = 'show';
