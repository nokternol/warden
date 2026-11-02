-- The file size filter is offered in GB rather than bytes. Saved filters move to the new key, with
-- each bound converted at 1 GB = 1,073,741,824 bytes, so a saved query selects the same files.
UPDATE `media_query_filter_values`
SET
  `filterKey` = 'fileSizeGb',
  `value` = json_remove(
    json_set(
      json_set(
        `value`,
        '$.min', json_extract(`value`, '$.min') / 1073741824.0
      ),
      '$.max', json_extract(`value`, '$.max') / 1073741824.0
    ),
    CASE WHEN json_extract(`value`, '$.min') IS NULL THEN '$.min' ELSE '$.__none' END,
    CASE WHEN json_extract(`value`, '$.max') IS NULL THEN '$.max' ELSE '$.__none' END
  )
WHERE `filterKey` = 'fileSizeBytes';
