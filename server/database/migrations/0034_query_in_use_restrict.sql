-- A query an automation uses cannot be deleted: removing it would silently drop the automation's
-- include or exclude, and a dropped exclude widens what a destructive task acts on. Deleting the
-- automation still removes its links. SQLite cannot alter a foreign key, so the table is rebuilt.
CREATE TABLE `automation_queries_new` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT,
  `automationId` INTEGER NOT NULL REFERENCES `automations`(`id`) ON DELETE CASCADE,
  `queryId`      INTEGER NOT NULL REFERENCES `media_queries`(`id`) ON DELETE RESTRICT,
  `role`         TEXT NOT NULL CHECK(`role` IN ('include', 'exclude')),
  `sortOrder`    INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
INSERT INTO `automation_queries_new` (`id`, `automationId`, `queryId`, `role`, `sortOrder`)
  SELECT `id`, `automationId`, `queryId`, `role`, `sortOrder` FROM `automation_queries`;
--> statement-breakpoint
DROP TABLE `automation_queries`;
--> statement-breakpoint
ALTER TABLE `automation_queries_new` RENAME TO `automation_queries`;
--> statement-breakpoint
CREATE INDEX `IDX_automation_queries_automationId` ON `automation_queries`(`automationId`);
