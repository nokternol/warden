-- The column holding a rule key is named for the rule, not for the "filter" it belongs to.
ALTER TABLE `media_query_filter_values` RENAME COLUMN `filterKey` TO `ruleKey`;
