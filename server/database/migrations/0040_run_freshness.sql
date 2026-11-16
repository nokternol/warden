-- Each run records how current the library copy it acted on was: the oldest last successful
-- refresh among the records that copy answers from, and the records that failed or never ran.
ALTER TABLE `automation_runs` ADD COLUMN `freshnessAsOf` integer;
--> statement-breakpoint
ALTER TABLE `automation_runs` ADD COLUMN `freshnessStale` text;
