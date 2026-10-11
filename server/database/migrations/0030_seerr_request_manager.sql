-- The request manager is one provider type, Seerr, which serves an Overseerr server as
-- well as a Seerr server (the APIs match). Overseerr's names are persisted in three
-- places: the enrichment field keys, the provider types, and the filter keys of saved
-- queries. Each is renamed in place so no stored value, provider or filter is lost.

-- Enrichment values reference their field by id, so renaming the key keeps every value.
UPDATE `enrichment_field` SET `key` = 'seerrRequestStatus' WHERE `key` = 'overseerrRequestStatus';
--> statement-breakpoint
UPDATE `enrichment_field` SET `key` = 'seerrHasIssue' WHERE `key` = 'overseerrHasIssue';
--> statement-breakpoint
-- Automations and media reference a provider by id, so only its type changes.
UPDATE `metadata_provider` SET `type` = 'SEERR' WHERE `type` = 'OVERSEERR';
--> statement-breakpoint
-- A saved query's filters are keyed by rule key; the values are unchanged.
UPDATE `media_query_filter_values` SET `filterKey` = 'seerrRequestStatus' WHERE `filterKey` = 'overseerrRequestStatus';
--> statement-breakpoint
UPDATE `media_query_filter_values` SET `filterKey` = 'seerrHasIssue' WHERE `filterKey` = 'overseerrHasIssue';
