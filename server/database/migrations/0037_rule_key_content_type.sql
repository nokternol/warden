-- The column holding a rule key is named for the rule, not for the "filter" it belongs to.
ALTER TABLE `media_query_filter_values` RENAME COLUMN `filterKey` TO `ruleKey`;
--> statement-breakpoint
-- The column scoping a title's id namespace holds a content type ('movie' | 'series'); RENAME COLUMN
-- also rewrites the partial unique indexes that filter on it.
ALTER TABLE `media_identity` RENAME COLUMN `kind` TO `contentType`;
