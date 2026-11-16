-- The library copy: each copy's provider record, when each kind of each provider's data was last
-- refreshed, and each provider's setup lists. All of it is rebuilt by the catalog refresh.
CREATE TABLE `media_item_payload` (
  `mediaItemId` integer PRIMARY KEY NOT NULL REFERENCES `media_item`(`id`) ON DELETE cascade,
  `data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_refresh` (
  `providerId` integer NOT NULL REFERENCES `metadata_provider`(`id`) ON DELETE cascade,
  `kind` text NOT NULL,
  `refreshedAt` integer,
  `failedAt` integer,
  `error` text,
  PRIMARY KEY(`providerId`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `provider_lists` (
  `providerId` integer PRIMARY KEY NOT NULL REFERENCES `metadata_provider`(`id`) ON DELETE cascade,
  `data` text NOT NULL
);
