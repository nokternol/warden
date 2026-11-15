import { radarrRowsSource, sonarrRowsSource } from '@server/modules/media/sourceAdapters';
import type { RadarrMovie } from '@server/modules/providers/connections/radarrProvider';
import type { SonarrSeries } from '@server/modules/providers/connections/sonarrProvider';
import { describe, expect, it } from 'vitest';

const movie: RadarrMovie = {
  id: 1,
  title: 'The Matrix',
  hasFile: true,
  monitored: true,
  tmdbId: 603,
  profileId: 1,
  qualityProfileId: 1,
  tags: [],
  folderName: '',
  path: '',
};

const series: SonarrSeries = {
  id: 1,
  title: 'Breaking Bad',
  status: 'ended',
  monitored: true,
  tvdbId: 81189,
  profileId: 1,
  qualityProfileId: 1,
  languageProfileId: 1,
  tags: [],
  path: '',
  seasons: [],
};

describe('the over-rows binders', () => {
  it("normalise the rows they were given into new objects on every read, so one match never sees another's enrichment", async () => {
    for (const [source, title] of [
      [radarrRowsSource([movie], 5), 'The Matrix'],
      [sonarrRowsSource([series], 5), 'Breaking Bad'],
    ] as const) {
      const firstRead = await source.getMediaItems();
      expect(firstRead).toHaveLength(1);
      const [first] = firstRead;
      Object.assign(first, { playCount: 3 });
      const [second] = await source.getMediaItems();

      expect(second).not.toBe(first);
      expect(second.playCount).toBeUndefined();
      expect(second.title).toBe(title);
      expect(second._sourceIds.providerId).toBe(5);
      expect(source.idOf(second)).toBe(1);
    }
  });
});
