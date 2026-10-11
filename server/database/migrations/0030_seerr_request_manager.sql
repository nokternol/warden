-- The request manager is one provider type, Seerr, which serves an Overseerr server as
-- well as a Seerr server (the APIs match). Overseerr's names are persisted in three
-- places: the enrichment field keys, the filter keys of saved queries, and provider
-- types. Each is renamed in place so no stored value, filter or provider is lost.
--
-- Enrichment values reference their field by id, so renaming the key keeps every value.
UPDATE `enrichment_field` SET `key` = 'seerrRequestStatus' WHERE `key` = 'overseerrRequestStatus';
--> statement-breakpoint
UPDATE `enrichment_field` SET `key` = 'seerrHasIssue' WHERE `key` = 'overseerrHasIssue';
