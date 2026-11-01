-- A run's targeted titles outlive the media rows they came from. Each link keeps the title and year
-- from when the run targeted it, and its mediaItemId empties rather than the link being deleted when a
-- provider's copies or the media data are removed.
CREATE TABLE `automation_run_items_new` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `runId`       INTEGER NOT NULL REFERENCES `automation_runs`(`id`) ON DELETE CASCADE,
  `mediaItemId` INTEGER REFERENCES `media_item`(`id`) ON DELETE SET NULL,
  `title`       TEXT,
  `year`        INTEGER
);
--> statement-breakpoint
INSERT INTO `automation_run_items_new` (`runId`, `mediaItemId`, `title`, `year`)
SELECT l.`runId`, l.`mediaItemId`, i.`title`, i.`year`
FROM `automation_run_items` l
JOIN `media_item` m ON m.`id` = l.`mediaItemId`
JOIN `media_identity` i ON i.`id` = m.`mediaIdentityId`;
--> statement-breakpoint
DROP TABLE `automation_run_items`;
--> statement-breakpoint
ALTER TABLE `automation_run_items_new` RENAME TO `automation_run_items`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_run_items_run_item` ON `automation_run_items` (`runId`, `mediaItemId`);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_items_media_item` ON `automation_run_items` (`mediaItemId`);
