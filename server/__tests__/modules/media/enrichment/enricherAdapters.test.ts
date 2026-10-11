import { MetadataProviderType } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import {
  jellyfinEnricher,
  plexEnricher,
  seerrEnricher,
  tautulliEnricher,
  tmdbEnricher,
} from '@server/modules/media/enrichment/enricherAdapters';
import type { NormalizedMovie } from '@server/modules/media/movie';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { JellyfinProvider } from '@server/modules/providers/connections/jellyfinProvider';
import { PlexProvider } from '@server/modules/providers/connections/plexProvider';
import { SeerrProvider } from '@server/modules/providers/connections/seerrProvider';
import { TautulliProvider } from '@server/modules/providers/connections/tautulliProvider';
import { TmdbProvider } from '@server/modules/providers/connections/tmdbProvider';
import { describe, expect, it, vi } from 'vitest';

const mockLogger = getChildLogger('TestEnricherAdapters');

const mockConfig: ProviderConfig = {
  name: 'Test Plex',
  url: 'http://localhost:32400',
  apiKey: 'fake-plex-token',
  settings: {},
};

describe('plexEnricher', () => {
  it('decorates a matched item with its play count, tagged by provider', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      { ratingKey: 'plex-1', title: 'The Matrix', type: 'movie', viewCount: 2 },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.provider).toBe(MetadataProviderType.PLEX);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].playCount).toBe(2);
    expect(result.items[0].plexAddedAt).toBeUndefined();
  });

  it('omits and does not mutate an item whose key it does not speak', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      { ratingKey: 'plex-1', title: 'The Matrix', type: 'movie', viewCount: 2 },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-999' }, title: 'Unknown' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items).toHaveLength(0);
    expect(item.playCount).toBeUndefined();
  });

  it('decorates a matched item with its ISO last-viewed timestamp', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      {
        ratingKey: 'plex-1',
        title: 'The Matrix',
        type: 'movie',
        viewCount: 2,
        lastViewedAt: 1700000000,
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items[0].lastWatchedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('decorates a matched item with its ISO added-to-Plex timestamp', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      {
        ratingKey: 'plex-1',
        title: 'The Matrix',
        type: 'movie',
        addedAt: 1700000000,
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items[0].plexAddedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('decorates a matched item with its studio', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      { ratingKey: 'plex-1', title: 'The Matrix', type: 'movie', studio: 'Warner Bros' },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items[0].studio).toBe('Warner Bros');
  });

  it('decorates a matched item with its runtime in minutes, converted from milliseconds', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      { ratingKey: 'plex-1', title: 'The Matrix', type: 'movie', duration: 8_160_000 },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items[0].runtimeMinutes).toBe(136);
  });

  it('decorates a matched item with its file-tech and release-date fields', async () => {
    const plex = new PlexProvider(mockConfig, mockLogger);
    vi.spyOn(plex, 'getAllItems').mockResolvedValue([
      {
        ratingKey: 'plex-1',
        title: 'The Matrix',
        type: 'movie',
        originallyAvailableAt: '1999-03-31',
        Label: [{ tag: '4K' }],
        Media: [
          {
            container: 'mkv',
            videoCodec: 'h264',
            audioCodec: 'dts',
            videoResolution: '1080',
            Part: [{ size: 8_589_934_592 }],
          },
        ],
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await plexEnricher(plex).enrich([item]);

    expect(result.items[0].releaseDate).toBe('1999-03-31');
    expect(result.items[0].fileContainer).toBe('mkv');
    expect(result.items[0].videoCodec).toBe('h264');
    expect(result.items[0].audioCodec).toBe('dts');
    expect(result.items[0].fileResolution).toBe('1080');
    expect(result.items[0].fileSizeBytes).toBe(8_589_934_592);
    expect(result.items[0].labels).toEqual(['4K']);
  });
});

describe('tautulliEnricher', () => {
  it('decorates a matched item with its play count, tagged by provider', async () => {
    const tautulli = new TautulliProvider(mockConfig, mockLogger);
    vi.spyOn(tautulli, 'getHistory').mockResolvedValue([
      {
        rating_key: 'plex-1',
        title: 'The Matrix',
        user: 'u',
        watched_status: 1,
        duration: 1,
        play_duration: 1,
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await tautulliEnricher(tautulli).enrich([item]);

    expect(result.provider).toBe(MetadataProviderType.TAUTULLI);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].playCount).toBe(1);
  });

  it('decorates a matched item with its ISO last-watched timestamp', async () => {
    const tautulli = new TautulliProvider(mockConfig, mockLogger);
    vi.spyOn(tautulli, 'getHistory').mockResolvedValue([
      {
        rating_key: 'plex-1',
        title: 'The Matrix',
        user: 'u',
        watched_status: 1,
        duration: 1,
        play_duration: 1,
        played_at: 1700000000,
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { plex: 'plex-1' }, title: 'The Matrix' };

    const result = await tautulliEnricher(tautulli).enrich([item]);

    expect(result.items[0].lastWatchedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });
});

describe('jellyfinEnricher', () => {
  const jellyfinConfig: ProviderConfig = {
    name: 'Test Jellyfin',
    url: 'http://localhost:8096',
    apiKey: 'fake-jellyfin-token',
    settings: { userId: 'test-user-id' },
  };

  it('decorates a matched item keyed by _sourceIds.jellyfin, tagged by provider', async () => {
    const jellyfin = new JellyfinProvider(jellyfinConfig, mockLogger);
    vi.spyOn(jellyfin, 'getAllItems').mockResolvedValue([
      { Id: 'jf-1', Name: 'The Matrix', Type: 'Movie', UserData: { PlayCount: 2 } },
    ]);
    const item: NormalizedMovie = { _sourceIds: { jellyfin: 'jf-1' }, title: 'The Matrix' };

    const result = await jellyfinEnricher(jellyfin).enrich([item]);

    expect(result.provider).toBe(MetadataProviderType.JELLYFIN);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].playCount).toBe(2);
  });

  it('omits and does not mutate an item whose key it does not speak', async () => {
    const jellyfin = new JellyfinProvider(jellyfinConfig, mockLogger);
    vi.spyOn(jellyfin, 'getAllItems').mockResolvedValue([
      { Id: 'jf-1', Name: 'The Matrix', Type: 'Movie', UserData: { PlayCount: 2 } },
    ]);
    const item: NormalizedMovie = { _sourceIds: { jellyfin: 'jf-999' }, title: 'Unknown' };

    const result = await jellyfinEnricher(jellyfin).enrich([item]);

    expect(result.items).toHaveLength(0);
    expect(item.playCount).toBeUndefined();
  });

  it('decorates a matched item with its favorite flag and jellyfinAddedAt timestamp', async () => {
    const jellyfin = new JellyfinProvider(jellyfinConfig, mockLogger);
    vi.spyOn(jellyfin, 'getAllItems').mockResolvedValue([
      {
        Id: 'jf-1',
        Name: 'The Matrix',
        Type: 'Movie',
        DateCreated: '2020-06-15T00:00:00.000Z',
        UserData: { IsFavorite: true },
      },
    ]);
    const item: NormalizedMovie = { _sourceIds: { jellyfin: 'jf-1' }, title: 'The Matrix' };

    const result = await jellyfinEnricher(jellyfin).enrich([item]);

    expect(result.items[0].isFavorite).toBe(true);
    expect(result.items[0].jellyfinAddedAt).toBe('2020-06-15T00:00:00.000Z');
  });
});

describe('seerrEnricher', () => {
  it('decorates a matched item with request status and issue flag, tagged by provider', async () => {
    const seerr = new SeerrProvider(mockConfig, mockLogger);
    vi.spyOn(seerr, 'getRequests').mockResolvedValue([
      {
        id: 1,
        status: 2,
        type: 'movie',
        requestedBy: { id: 1, displayName: 'u', email: 'u@u.com' },
        media: { tmdbId: 100, title: 'M' },
        createdAt: '',
      },
    ]);
    vi.spyOn(seerr, 'getIssues').mockResolvedValue([{ id: 1, status: 1, media: { tmdbId: 100 } }]);
    const item: NormalizedMovie = { _sourceIds: { tmdb: 100 }, title: 'M' };

    const result = await seerrEnricher(seerr).enrich([item]);

    expect(result.provider).toBe(MetadataProviderType.SEERR);
    expect(result.items[0].seerrRequestStatus).toBe(2);
    expect(result.items[0].seerrHasIssue).toBe(true);
  });
});

describe('tmdbEnricher', () => {
  it('calls getStatus once per unique tmdbId, even with duplicate ids in the batch', async () => {
    const tmdb = new TmdbProvider(mockConfig, mockLogger);
    const getStatus = vi.spyOn(tmdb, 'getStatus').mockResolvedValue('Released');
    const items: NormalizedMovie[] = [
      { _sourceIds: { tmdb: 100 }, title: 'M1' },
      { _sourceIds: { tmdb: 100 }, title: 'M1 dup' },
    ];

    const result = await tmdbEnricher(tmdb).enrich(items);

    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe(MetadataProviderType.TMDB);
    expect(result.items.every((i) => i.tmdbStatus === 'Released')).toBe(true);
  });
});
