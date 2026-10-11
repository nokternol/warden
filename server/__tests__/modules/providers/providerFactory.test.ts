import { MetadataProviderType } from '@server/database/schema';
import type { MetadataProvider } from '@server/database/schema';
import { getChildLogger } from '@server/kernel/logger';
import { JellyfinProvider } from '@server/modules/providers/connections/jellyfinProvider';
import { PlexProvider } from '@server/modules/providers/connections/plexProvider';
import { RadarrProvider } from '@server/modules/providers/connections/radarrProvider';
import { SeerrProvider } from '@server/modules/providers/connections/seerrProvider';
import { SonarrProvider } from '@server/modules/providers/connections/sonarrProvider';
import { TautulliProvider } from '@server/modules/providers/connections/tautulliProvider';
import { TvMazeProvider } from '@server/modules/providers/connections/tvmazeProvider';
import { ProviderFactory } from '@server/modules/providers/providerFactory';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const log = getChildLogger('TestProviderFactory');

function makeProvider(type: MetadataProviderType): MetadataProvider {
  return {
    id: 1,
    type,
    name: 'Test Provider',
    url: 'http://localhost:9090',
    apiKey: 'test-key',
    settings: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ProviderFactory.create', () => {
  const factory = new ProviderFactory();

  it('creates a RadarrProvider for RADARR type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.RADARR), log)).toBeInstanceOf(
      RadarrProvider
    );
  });

  it('creates a SonarrProvider for SONARR type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.SONARR), log)).toBeInstanceOf(
      SonarrProvider
    );
  });

  it('creates a PlexProvider for PLEX type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.PLEX), log)).toBeInstanceOf(
      PlexProvider
    );
  });

  it('creates a JellyfinProvider for JELLYFIN type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.JELLYFIN), log)).toBeInstanceOf(
      JellyfinProvider
    );
  });

  it('creates a TautulliProvider for TAUTULLI type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.TAUTULLI), log)).toBeInstanceOf(
      TautulliProvider
    );
  });

  it('creates a SeerrProvider for SEERR type', () => {
    expect(factory.create(makeProvider(MetadataProviderType.SEERR), log)).toBeInstanceOf(
      SeerrProvider
    );
  });

  it('throws an error for an unsupported provider type', () => {
    const unsupported = makeProvider(MetadataProviderType.TVMAZE);
    expect(() => factory.create(unsupported, log)).toThrow('Unsupported provider type: TVMAZE');
  });
});

describe('ProviderFactory.createMany', () => {
  const factory = new ProviderFactory();

  it('places each active provider into its typed slot, leaving absent types undefined', () => {
    const set = factory.createMany(
      [makeProvider(MetadataProviderType.PLEX), makeProvider(MetadataProviderType.TAUTULLI)],
      log
    );

    expect(set.plex).toBeInstanceOf(PlexProvider);
    expect(set.tautulli).toBeInstanceOf(TautulliProvider);
    expect(set.overseerr).toBeUndefined();
  });

  it('places an active Jellyfin provider into its typed slot', () => {
    const set = factory.createMany([makeProvider(MetadataProviderType.JELLYFIN)], log);

    expect(set.jellyfin).toBeInstanceOf(JellyfinProvider);
  });

  it('has no radarr/sonarr slots — MediaSource instances are never collapsed to one', () => {
    const set = factory.createMany(
      [makeProvider(MetadataProviderType.RADARR), makeProvider(MetadataProviderType.SONARR)],
      log
    );

    expect((set as Record<string, unknown>).radarr).toBeUndefined();
    expect((set as Record<string, unknown>).sonarr).toBeUndefined();
  });
});

describe('ProviderFactory.createInstances', () => {
  const factory = new ProviderFactory();

  it('constructs one instance per configured provider, never collapsing same-type entries', () => {
    const first = makeProvider(MetadataProviderType.RADARR);
    const second = { ...makeProvider(MetadataProviderType.RADARR), id: 2, name: '4k Radarr' };

    const instances = factory.createInstances([first, second], log);

    expect(instances).toHaveLength(2);
    expect(instances[0].settings.id).toBe(first.id);
    expect(instances[0].provider).toBeInstanceOf(RadarrProvider);
    expect(instances[1].settings.id).toBe(second.id);
    expect(instances[1].provider).toBeInstanceOf(RadarrProvider);
  });
});

describe('ProviderFactory.createTvMaze', () => {
  const factory = new ProviderFactory();

  afterEach(() => server.resetHandlers());

  it('returns a TvMazeProvider wired to the public TVmaze API', async () => {
    const provider = factory.createTvMaze(log);
    expect(provider).toBeInstanceOf(TvMazeProvider);

    server.use(
      http.get('https://api.tvmaze.com/lookup/shows', () => HttpResponse.json({ id: 169 }))
    );
    await expect(provider.lookupByTvdbId(81189)).resolves.toEqual({ id: 169 });
  });
});
