-- An instance-scoped filter value (tags, quality and language profiles) names the
-- configured instance its ids belong to inside the value itself: `{ "providerId", "ids" }`,
-- with `providerId` omitted when the value was unqualified. The separate providerId column
-- is folded into the value and dropped; values of every other rule are copied unchanged.
CREATE TABLE `media_query_filter_values_new` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `mediaQueryId` INTEGER NOT NULL REFERENCES `media_queries`(`id`) ON DELETE CASCADE,
  `filterKey`    TEXT NOT NULL,
  `value`        TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO `media_query_filter_values_new` (`id`, `mediaQueryId`, `filterKey`, `value`)
SELECT
  `id`,
  `mediaQueryId`,
  `filterKey`,
  CASE
    WHEN `filterKey` IN ('tagIds', 'qualityProfileIds', 'languageProfileIds') THEN
      CASE
        WHEN `providerId` IS NULL THEN json_object('ids', json(
          CASE WHEN json_valid('[' || replace(`value`, ' ', '') || ']')
            THEN '[' || replace(`value`, ' ', '') || ']' ELSE '[]' END))
        ELSE json_object('providerId', `providerId`, 'ids', json(
          CASE WHEN json_valid('[' || replace(`value`, ' ', '') || ']')
            THEN '[' || replace(`value`, ' ', '') || ']' ELSE '[]' END))
      END
    ELSE `value`
  END
FROM `media_query_filter_values`;
--> statement-breakpoint
DROP TABLE `media_query_filter_values`;
--> statement-breakpoint
ALTER TABLE `media_query_filter_values_new` RENAME TO `media_query_filter_values`;
--> statement-breakpoint
CREATE INDEX `IDX_mqfv_queryId` ON `media_query_filter_values`(`mediaQueryId`);
