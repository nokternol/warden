import {
  jellyfinFieldProvider,
  overseerrFieldProvider,
  plexFieldProvider,
  radarrTagsFieldSource,
  sonarrTagsFieldSource,
  tautulliFieldProvider,
  tmdbFieldSource,
} from '@server/modules/media/mediaFieldProvider';
import type {
  JellyfinItem,
  PlexMediaItem,
  SeerrIssue,
  SeerrRequest,
  TautulliHistoryItem,
} from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

describe('radarrTagsFieldSource', () => {
  it('transforms Radarr tags into the canonical tags field', () => {
    const result = radarrTagsFieldSource.toEnrichmentFields([10, 20]);

    expect(result).toEqual({ tags: [10, 20] });
  });
});

describe('sonarrTagsFieldSource', () => {
  it('transforms Sonarr tags into the canonical tags field', () => {
    const result = sonarrTagsFieldSource.toEnrichmentFields([30, 40]);

    expect(result).toEqual({ tags: [30, 40] });
  });
});

function history(rating_key: string, played_at?: number): TautulliHistoryItem {
  return {
    rating_key,
    title: 'T',
    watched_status: 1,
    duration: 3600,
    play_duration: 3600,
    user: 'u',
    ...(played_at !== undefined ? { played_at } : {}),
  } as TautulliHistoryItem;
}

describe('tautulliFieldProvider.visit', () => {
  it('aggregates play count per rating_key across history rows', () => {
    const result = tautulliFieldProvider.visit([
      history('abc123', 1000),
      history('abc123', 2000),
      history('other', 3000),
    ]);

    expect(result.get('abc123')?.playCount).toBe(2);
    expect(result.get('other')?.playCount).toBe(1);
  });
});

describe('tautulliFieldProvider.toEnrichmentFields', () => {
  it('converts the native unix timestamp into an ISO lastWatchedAt', () => {
    const native = tautulliFieldProvider.visit([history('abc123', 1700000000)]).get('abc123')!;

    const result = tautulliFieldProvider.toEnrichmentFields(native);

    expect(result).toEqual({
      playCount: 1,
      lastWatchedAt: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it('omits lastWatchedAt entirely when no play carried a timestamp', () => {
    const native = tautulliFieldProvider.visit([history('abc123')]).get('abc123')!;

    const result = tautulliFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('lastWatchedAt');
  });
});

function overseerrRequest(tmdbId: number, status: number): SeerrRequest {
  return {
    id: 1,
    status,
    type: 'movie',
    requestedBy: { id: 1, displayName: 'u', email: 'u@u.com' },
    media: { tmdbId, title: 'T' },
    createdAt: '',
  };
}

function overseerrIssue(tmdbId: number): SeerrIssue {
  return { id: 1, status: 1, media: { tmdbId } };
}

describe('overseerrFieldProvider.visit', () => {
  it('maps request status and issue presence by tmdbId', () => {
    const result = overseerrFieldProvider.visit([
      [overseerrRequest(100, 2), overseerrRequest(999, 3)],
      [overseerrIssue(100)],
    ]);

    expect(result.get(100)).toEqual({ requestStatus: 2, hasIssue: true });
    expect(result.get(999)).toEqual({ requestStatus: 3 });
  });
});

describe('plexFieldProvider.visit', () => {
  it('maps view count and last-viewed timestamp per ratingKey', () => {
    const items: PlexMediaItem[] = [
      { ratingKey: 'plex-101', title: 'M', type: 'movie', viewCount: 5, lastViewedAt: 1700000000 },
    ];

    const result = plexFieldProvider.visit(items);

    expect(result.get('plex-101')).toEqual({ playCount: 5, lastPlayedUnix: 1700000000 });
  });
});

describe('plexFieldProvider — studio', () => {
  it('carries studio through to the canonical field', () => {
    const items: PlexMediaItem[] = [
      { ratingKey: 'plex-101', title: 'M', type: 'movie', studio: 'Legendary Pictures' },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.studio).toBe('Legendary Pictures');
  });
});

describe('plexFieldProvider — runtimeMinutes', () => {
  it('converts duration from milliseconds to minutes', () => {
    const items: PlexMediaItem[] = [
      { ratingKey: 'plex-101', title: 'M', type: 'movie', duration: 7_320_000 },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.runtimeMinutes).toBe(122);
  });

  it('omits runtimeMinutes when duration is absent', () => {
    const items: PlexMediaItem[] = [{ ratingKey: 'plex-101', title: 'M', type: 'movie' }];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('runtimeMinutes');
  });
});

describe('plexFieldProvider — fileSizeBytes', () => {
  it('carries the file size from Media/Part through to the canonical field', () => {
    const items: PlexMediaItem[] = [
      {
        ratingKey: 'plex-101',
        title: 'M',
        type: 'movie',
        Media: [{ Part: [{ size: 4_294_967_296 }] }],
      },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.fileSizeBytes).toBe(4_294_967_296);
  });

  it('omits fileSizeBytes when no Media/Part is present', () => {
    const items: PlexMediaItem[] = [{ ratingKey: 'plex-101', title: 'M', type: 'movie' }];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('fileSizeBytes');
  });
});

describe('plexFieldProvider — releaseDate', () => {
  it('carries originallyAvailableAt through to the canonical field unchanged', () => {
    const items: PlexMediaItem[] = [
      { ratingKey: 'plex-101', title: 'M', type: 'movie', originallyAvailableAt: '1999-03-31' },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.releaseDate).toBe('1999-03-31');
  });
});

describe('plexFieldProvider — file-tech fields', () => {
  it('carries container, video codec, audio codec, and resolution from the primary Media/Part', () => {
    const items: PlexMediaItem[] = [
      {
        ratingKey: 'plex-101',
        title: 'M',
        type: 'movie',
        Media: [
          {
            container: 'mkv',
            videoCodec: 'h264',
            audioCodec: 'aac',
            videoResolution: '1080',
            Part: [{ size: 123 }],
          },
        ],
      },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.fileContainer).toBe('mkv');
    expect(result.videoCodec).toBe('h264');
    expect(result.audioCodec).toBe('aac');
    expect(result.fileResolution).toBe('1080');
  });

  it('omits file-tech fields when no Media entry is present', () => {
    const items: PlexMediaItem[] = [{ ratingKey: 'plex-101', title: 'M', type: 'movie' }];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('fileContainer');
    expect(result).not.toHaveProperty('videoCodec');
    expect(result).not.toHaveProperty('audioCodec');
    expect(result).not.toHaveProperty('fileResolution');
  });
});

describe('plexFieldProvider — labels', () => {
  it('carries Label tags through as a string array', () => {
    const items: PlexMediaItem[] = [
      {
        ratingKey: 'plex-101',
        title: 'M',
        type: 'movie',
        Label: [{ tag: '4K' }, { tag: 'Favorites' }],
      },
    ];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result.labels).toEqual(['4K', 'Favorites']);
  });

  it('omits labels when there are no Label tags', () => {
    const items: PlexMediaItem[] = [{ ratingKey: 'plex-101', title: 'M', type: 'movie' }];

    const native = plexFieldProvider.visit(items).get('plex-101')!;
    const result = plexFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('labels');
  });
});

describe('tmdbFieldSource', () => {
  it('transforms the raw TMDB status string into the canonical tmdbStatus field', () => {
    const result = tmdbFieldSource.toEnrichmentFields('Released');

    expect(result).toEqual({ tmdbStatus: 'Released' });
  });
});

describe('jellyfinFieldProvider.visit', () => {
  it('maps play count and last-played timestamp per item id', () => {
    const items: JellyfinItem[] = [
      {
        Id: 'jf-101',
        Name: 'M',
        Type: 'Movie',
        UserData: { PlayCount: 5, LastPlayedDate: '2024-01-01T00:00:00.000Z' },
      },
    ];

    const result = jellyfinFieldProvider.visit(items);

    expect(result.get('jf-101')?.playCount).toBe(5);
    expect(result.get('jf-101')?.lastPlayedUnix).toBe(
      Date.parse('2024-01-01T00:00:00.000Z') / 1000
    );
  });

  it('synthesizes playCount from Played when PlayCount is absent', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', UserData: { Played: true } },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;

    expect(native.playCount).toBe(1);
  });

  it('synthesizes playCount as 0 when neither PlayCount nor Played is present', () => {
    const items: JellyfinItem[] = [{ Id: 'jf-101', Name: 'M', Type: 'Movie' }];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;

    expect(native.playCount).toBe(0);
  });
});

describe('jellyfinFieldProvider.toEnrichmentFields', () => {
  it('carries studio through to the canonical field', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', Studios: [{ Name: 'Legendary Pictures' }] },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.studio).toBe('Legendary Pictures');
  });

  it('converts RunTimeTicks (10,000 ticks/ms) into runtimeMinutes', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', RunTimeTicks: 73_200_000_000 },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.runtimeMinutes).toBe(122);
  });

  it('omits runtimeMinutes when RunTimeTicks is absent', () => {
    const items: JellyfinItem[] = [{ Id: 'jf-101', Name: 'M', Type: 'Movie' }];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('runtimeMinutes');
  });

  it('carries file-tech fields from the primary MediaSource/MediaStream', () => {
    const items: JellyfinItem[] = [
      {
        Id: 'jf-101',
        Name: 'M',
        Type: 'Movie',
        MediaSources: [
          {
            Container: 'mkv',
            Size: 8_589_934_592,
            MediaStreams: [
              { Type: 'Video', Codec: 'hevc', Height: 2160 },
              { Type: 'Audio', Codec: 'dts' },
            ],
          },
        ],
      },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.fileContainer).toBe('mkv');
    expect(result.videoCodec).toBe('hevc');
    expect(result.audioCodec).toBe('dts');
    expect(result.fileSizeBytes).toBe(8_589_934_592);
  });

  it('omits file-tech fields when no MediaSources entry is present', () => {
    const items: JellyfinItem[] = [{ Id: 'jf-101', Name: 'M', Type: 'Movie' }];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('fileContainer');
    expect(result).not.toHaveProperty('videoCodec');
    expect(result).not.toHaveProperty('audioCodec');
    expect(result).not.toHaveProperty('fileSizeBytes');
  });

  it('carries PremiereDate through as releaseDate unchanged', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', PremiereDate: '1999-03-31T00:00:00.000Z' },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.releaseDate).toBe('1999-03-31T00:00:00.000Z');
  });

  it('carries DateCreated through as jellyfinAddedAt unchanged', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', DateCreated: '2020-06-15T00:00:00.000Z' },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.jellyfinAddedAt).toBe('2020-06-15T00:00:00.000Z');
  });

  it('carries Tags through as the shared labels field', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', Tags: ['4K', 'Favorites'] },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.labels).toEqual(['4K', 'Favorites']);
  });

  it('omits labels when there are no Tags', () => {
    const items: JellyfinItem[] = [{ Id: 'jf-101', Name: 'M', Type: 'Movie' }];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('labels');
  });

  it('carries IsFavorite through as the isFavorite field', () => {
    const items: JellyfinItem[] = [
      { Id: 'jf-101', Name: 'M', Type: 'Movie', UserData: { IsFavorite: true } },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.isFavorite).toBe(true);
  });

  it('omits isFavorite when UserData is absent', () => {
    const items: JellyfinItem[] = [{ Id: 'jf-101', Name: 'M', Type: 'Movie' }];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result).not.toHaveProperty('isFavorite');
  });

  it('carries play count and ISO last-played timestamp through', () => {
    const items: JellyfinItem[] = [
      {
        Id: 'jf-101',
        Name: 'M',
        Type: 'Movie',
        UserData: { PlayCount: 3, LastPlayedDate: '2024-05-01T12:00:00.000Z' },
      },
    ];

    const native = jellyfinFieldProvider.visit(items).get('jf-101')!;
    const result = jellyfinFieldProvider.toEnrichmentFields(native);

    expect(result.playCount).toBe(3);
    expect(result.lastWatchedAt).toBe('2024-05-01T12:00:00.000Z');
  });
});
