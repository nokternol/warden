-- A filter finding a user can accept as known risk ("no title holds a value for this field"),
-- recorded per automation so the acceptance persists. A re-check deletes the rows whose finding
-- is gone; a finding that comes back is a new row, not yet signed off.
CREATE TABLE `automation_blocks` (
  `id`           INTEGER PRIMARY KEY AUTOINCREMENT,
  `automationId` INTEGER NOT NULL REFERENCES `automations`(`id`) ON DELETE CASCADE,
  `findingId`    TEXT NOT NULL,
  `queryId`      INTEGER,
  `ruleKey`      TEXT,
  `kind`         TEXT NOT NULL,
  `providerIds`  TEXT NOT NULL,
  `firstSeenAt`  TEXT NOT NULL DEFAULT (datetime('now')),
  `signedOffAt`  INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_automation_blocks_finding` ON `automation_blocks`(`automationId`, `findingId`);
