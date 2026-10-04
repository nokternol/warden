-- An instance-scoped filter value (tags, quality and language profiles) names the
-- configured instance its ids belong to inside the value itself: `{ "providerId", "ids" }`,
-- with `providerId` omitted when the value was unqualified. The separate providerId column
-- is folded into the value and dropped; values of every other rule are copied unchanged.
--
-- The stored CSV is read as the filter registry always read it: split on commas, trimmed,
-- and only positive integers kept ("1,,2" -> [1,2]; "0,3,-1,x" -> [3]; "abc" -> []).
--
-- A providerId on a row of any other rule is dropped with the column: the client only ever
-- qualified instance-scoped rules (tags, quality and language profiles), so no other rule's
-- value carried a meaningful one.
CREATE TABLE `media_query_filter_values_new` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `mediaQueryId` INTEGER NOT NULL REFERENCES `media_queries`(`id`) ON DELETE CASCADE,
  `filterKey`    TEXT NOT NULL,
  `value`        TEXT NOT NULL
);
--> statement-breakpoint
WITH RECURSIVE
  `split`(`rowId`, `ord`, `part`, `rest`) AS (
    SELECT `id`, 0, '', `value` || ','
    FROM `media_query_filter_values`
    WHERE `filterKey` IN ('tagIds', 'qualityProfileIds', 'languageProfileIds')
    UNION ALL
    SELECT `rowId`, `ord` + 1,
      trim(substr(`rest`, 1, instr(`rest`, ',') - 1), ' ' || char(9) || char(10) || char(13)),
      substr(`rest`, instr(`rest`, ',') + 1)
    FROM `split`
    WHERE `rest` <> ''
  ),
  `ids`(`rowId`, `ord`, `n`) AS (
    SELECT `rowId`, `ord`, CAST(`part` AS INTEGER)
    FROM `split`
    WHERE `ord` > 0 AND `part` <> '' AND `part` NOT GLOB '*[^0-9]*' AND CAST(`part` AS INTEGER) > 0
  )
INSERT INTO `media_query_filter_values_new` (`id`, `mediaQueryId`, `filterKey`, `value`)
SELECT
  v.`id`,
  v.`mediaQueryId`,
  v.`filterKey`,
  CASE
    WHEN v.`filterKey` IN ('tagIds', 'qualityProfileIds', 'languageProfileIds') THEN
      CASE
        WHEN v.`providerId` IS NULL THEN json_object('ids', json(
          (SELECT json_group_array(`n`) FROM (SELECT `n` FROM `ids` WHERE `rowId` = v.`id` ORDER BY `ord`))))
        ELSE json_object('providerId', v.`providerId`, 'ids', json(
          (SELECT json_group_array(`n`) FROM (SELECT `n` FROM `ids` WHERE `rowId` = v.`id` ORDER BY `ord`))))
      END
    ELSE v.`value`
  END
FROM `media_query_filter_values` v;
--> statement-breakpoint
DROP TABLE `media_query_filter_values`;
--> statement-breakpoint
ALTER TABLE `media_query_filter_values_new` RENAME TO `media_query_filter_values`;
--> statement-breakpoint
CREATE INDEX `IDX_mqfv_queryId` ON `media_query_filter_values`(`mediaQueryId`);
