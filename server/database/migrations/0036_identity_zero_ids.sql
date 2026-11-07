-- A TMDB or TVDB id of 0 means the provider has none (Sonarr reports tvdbId 0 for a series it
-- cannot match), but identity resolution once treated it as a real primary id, so unrelated titles
-- reported with 0 were joined into one group. Such a group also took the imdb, TVmaze and (for a
-- series) TMDB ids of whichever copy filled them first, and its Plex or Jellyfin id may address any of the joined
-- titles. Clearing all of these leaves the group findable only by title and year, so the next
-- identity run moves each copy to its own group, and no actuator id can address the wrong title
-- until the stamping passes set it again.
UPDATE `media_identity`
  SET `imdbId` = NULL, `tvMazeId` = NULL, `plexRatingKey` = NULL, `jellyfinItemId` = NULL,
      `enrichedAt` = NULL
  WHERE (`kind` = 'movie' AND `tmdbId` <= 0) OR (`kind` = 'series' AND `tvdbId` <= 0);
--> statement-breakpoint
UPDATE `media_identity` SET `tmdbId` = NULL WHERE `kind` = 'series' AND `tvdbId` <= 0;
--> statement-breakpoint
UPDATE `media_identity` SET `tmdbId` = NULL WHERE `tmdbId` <= 0;
--> statement-breakpoint
UPDATE `media_identity` SET `tvdbId` = NULL WHERE `tvdbId` <= 0;
