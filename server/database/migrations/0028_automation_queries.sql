-- An automation's included and excluded queries are "automation queries"; "source" is
-- reserved for the MediaSource role. Rows are untouched; only the table and index names change.
ALTER TABLE `automation_query_sources` RENAME TO `automation_queries`;
--> statement-breakpoint
DROP INDEX `IDX_aqsources_automationId`;
--> statement-breakpoint
CREATE INDEX `IDX_automation_queries_automationId` ON `automation_queries`(`automationId`);
