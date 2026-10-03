ALTER TABLE `media_item` ADD `deleted` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `automation_run_items` (
	`runId` integer NOT NULL,
	`mediaItemId` integer NOT NULL,
	PRIMARY KEY(`runId`, `mediaItemId`),
	FOREIGN KEY (`runId`) REFERENCES `automation_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mediaItemId`) REFERENCES `media_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_items_media_item` ON `automation_run_items` (`mediaItemId`);
