-- Each provider keeps the outcome of the last connection test of its saved address and key, so the
-- Providers page can show it after a reload. All three are null until a test runs.
ALTER TABLE `metadata_provider` ADD `lastTestOk` integer;
--> statement-breakpoint
ALTER TABLE `metadata_provider` ADD `lastTestAt` integer;
--> statement-breakpoint
ALTER TABLE `metadata_provider` ADD `lastTestError` text;
