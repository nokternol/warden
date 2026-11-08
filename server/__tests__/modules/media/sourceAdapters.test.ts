import { getChildLogger } from '@server/kernel/logger';
import {
  mediaSourceFor,
  radarrMediaSource,
  radarrRowsSource,
  sonarrMediaSource,
  sonarrRowsSource,
} from '@server/modules/media/sourceAdapters';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { RadarrProvider } from '@server/modules/providers/connections/radarrProvider';
import type { RadarrMovie } from '@server/modules/providers/connections/radarrProvider';
import { SonarrProvider } from '@server/modules/providers/connections/sonarrProvider';
import type { SonarrSeries } from '@server/modules/providers/connections/sonarrProvider';
import { describe, expect, it, vi } from 'vitest';

const mockLogger = getChildLogger('TestSourceAdapters');

const mockConfig: ProviderConfig = {
  name: 'Test Provider',
  url: 'http://localhost',
  apiKey: 'fake-api-key',
  settings: {},
};

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

describe('radarrMediaSource', () => {
  it('adapts a RadarrProvider into a MediaSource over normalized items carrying providerId', async () => {
    const radarr = new RadarrProvider(mockConfig, mockLogger);
    vi.spyOn(radarr, 'getMovies').mockResolvedValue([movie]);

    const source = radarrMediaSource(radarr, 5);
    const items = await source.getMediaItems();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('The Matrix');
    expect(source.idOf(items[0])).toBe(1);
    expect(items[0]._sourceIds.providerId).toBe(5);
  });
});

describe('sonarrMediaSource', () => {
  it('adapts a SonarrProvider into a MediaSource over normalized items carrying providerId', async () => {
    const sonarr = new SonarrProvider(mockConfig, mockLogger);
    vi.spyOn(sonarr, 'getSeries').mockResolvedValue([series]);

    const source = sonarrMediaSource(sonarr, 6);
    const items = await source.getMediaItems();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Breaking Bad');
    expect(source.idOf(items[0])).toBe(1);
    expect(items[0]._sourceIds.providerId).toBe(6);
  });
});

describe('mediaSourceFor', () => {
  it('dispatches a RadarrProvider to radarrMediaSource, threading providerId', async () => {
    const radarr = new RadarrProvider(mockConfig, mockLogger);
    vi.spyOn(radarr, 'getMovies').mockResolvedValue([movie]);
    const source = mediaSourceFor(radarr, 5);
    const [item] = await source.getMediaItems();
    expect(item._sourceIds.providerId).toBe(5);
  });

  it('dispatches a SonarrProvider to sonarrMediaSource, threading providerId', async () => {
    const sonarr = new SonarrProvider(mockConfig, mockLogger);
    vi.spyOn(sonarr, 'getSeries').mockResolvedValue([series]);
    const source = mediaSourceFor(sonarr, 6);
    const [item] = await source.getMediaItems();
    expect(item._sourceIds.providerId).toBe(6);
  });
});

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

describe('the connection-bound adapters', () => {
  it('fetch the library once per read, and again on the next', async () => {
    const radarr = new RadarrProvider(mockConfig, mockLogger);
    const getMovies = vi.spyOn(radarr, 'getMovies').mockResolvedValue([movie]);
    const sonarr = new SonarrProvider(mockConfig, mockLogger);
    const getSeries = vi.spyOn(sonarr, 'getSeries').mockResolvedValue([series]);

    for (const source of [radarrMediaSource(radarr, 5), sonarrMediaSource(sonarr, 5)]) {
      await source.getMediaItems();
      await source.getMediaItems();
    }

    expect(getMovies).toHaveBeenCalledTimes(2);
    expect(getSeries).toHaveBeenCalledTimes(2);
  });
});
