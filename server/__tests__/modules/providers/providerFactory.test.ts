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

  it('builds every provider type from its class in the class map, TVmaze included', () => {
    expect(factory.create(makeProvider(MetadataProviderType.TVMAZE), log)).toBeInstanceOf(
      TvMazeProvider
    );
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
    expect(set.seerr).toBeUndefined();
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

describe('ProviderFactory role queries', () => {
  const factory = new ProviderFactory();
  const row = (id: number, type: MetadataProviderType) => ({
    ...makeProvider(type),
    id,
    name: `${type} ${id}`,
  });
  const rows = [
    row(1, MetadataProviderType.RADARR),
    row(2, MetadataProviderType.SONARR),
    row(3, MetadataProviderType.PLEX),
    row(4, MetadataProviderType.JELLYFIN),
    row(5, MetadataProviderType.TAUTULLI),
    row(6, MetadataProviderType.RADARR),
  ];
  const named = (entries: Array<{ providerId: number; name: string; provider: object }>) =>
    entries.map(({ providerId, name, provider }) => ({
      providerId,
      name,
      kind: provider.constructor,
    }));

  it('answers, for each role, the rows whose type declares it, each with its connection', () => {
    expect(named(factory.movieSourcesOf(rows, log))).toEqual([
      { providerId: 1, name: 'RADARR 1', kind: RadarrProvider },
      { providerId: 6, name: 'RADARR 6', kind: RadarrProvider },
    ]);
    expect(named(factory.seriesSourcesOf(rows, log))).toEqual([
      { providerId: 2, name: 'SONARR 2', kind: SonarrProvider },
    ]);
    expect(named([factory.plexServerOf(rows, log)].flatMap((s) => (s ? [s] : [])))).toEqual([
      { providerId: 3, name: 'PLEX 3', kind: PlexProvider },
    ]);
    expect(named([factory.jellyfinServerOf(rows, log)].flatMap((s) => (s ? [s] : [])))).toEqual([
      { providerId: 4, name: 'JELLYFIN 4', kind: JellyfinProvider },
    ]);
    expect(factory.plexServerOf([row(5, MetadataProviderType.TAUTULLI)], log)).toBeUndefined();
  });
});

describe('ProviderFactory.tvMazeLookup', () => {
  const factory = new ProviderFactory();

  afterEach(() => server.resetHandlers());

  it('returns a TvMazeProvider wired to the public TVmaze API', async () => {
    const provider = factory.tvMazeLookup(log);
    expect(provider).toBeInstanceOf(TvMazeProvider);

    server.use(
      http.get('https://api.tvmaze.com/lookup/shows', () => HttpResponse.json({ id: 169 }))
    );
    await expect(provider.lookupByTvdbId(81189)).resolves.toEqual({ id: 169 });
  });
});
