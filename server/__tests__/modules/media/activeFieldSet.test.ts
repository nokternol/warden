import { MetadataProviderType } from '@server/database/schema';
import { DomainEventBus } from '@server/kernel/eventBus';
import {
  ActiveFieldSetCache,
  activeFieldSet,
  fieldsByProviderType,
} from '@server/modules/media/activeFieldSet';
import { describe, expect, it, vi } from 'vitest';

describe('fieldsByProviderType', () => {
  it('declares tags as the field Radarr produces', () => {
    expect(fieldsByProviderType[MetadataProviderType.RADARR]).toEqual(['tags']);
  });

  it('declares playCount and lastWatchedAt for Tautulli', () => {
    expect(fieldsByProviderType[MetadataProviderType.TAUTULLI]).toEqual([
      'playCount',
      'lastWatchedAt',
    ]);
  });

  it('declares every field Plex produces', () => {
    expect(fieldsByProviderType[MetadataProviderType.PLEX]).toEqual([
      'playCount',
      'lastWatchedAt',
      'plexAddedAt',
      'studio',
      'runtimeMinutes',
      'fileSizeBytes',
      'releaseDate',
      'fileContainer',
      'videoCodec',
      'audioCodec',
      'fileResolution',
      'labels',
    ]);
  });

  it('declares every field Jellyfin produces', () => {
    expect(fieldsByProviderType[MetadataProviderType.JELLYFIN]).toEqual([
      'playCount',
      'lastWatchedAt',
      'jellyfinAddedAt',
      'studio',
      'runtimeMinutes',
      'fileSizeBytes',
      'releaseDate',
      'fileContainer',
      'videoCodec',
      'audioCodec',
      'fileResolution',
      'labels',
      'isFavorite',
    ]);
  });

  it('declares seerrRequestStatus and seerrHasIssue for Seerr', () => {
    expect(fieldsByProviderType[MetadataProviderType.SEERR]).toEqual([
      'seerrRequestStatus',
      'seerrHasIssue',
    ]);
  });

  it('declares tmdbStatus for TMDB', () => {
    expect(fieldsByProviderType[MetadataProviderType.TMDB]).toEqual(['tmdbStatus']);
  });

  it('declares tags as the field Sonarr produces', () => {
    expect(fieldsByProviderType[MetadataProviderType.SONARR]).toEqual(['tags']);
  });
});

describe('activeFieldSet', () => {
  it('unions the fields of every active provider type', () => {
    const result = activeFieldSet(
      new Set([MetadataProviderType.RADARR, MetadataProviderType.TAUTULLI])
    );

    expect(result).toEqual(new Set(['tags', 'playCount', 'lastWatchedAt']));
  });
});

describe('ActiveFieldSetCache', () => {
  it('computes once and reuses the cached value on a second get()', async () => {
    const activeTypes = vi.fn().mockResolvedValue(new Set([MetadataProviderType.RADARR]));
    const cache = new ActiveFieldSetCache({ providerSettingsService: { activeTypes } });

    await cache.get();
    await cache.get();

    expect(activeTypes).toHaveBeenCalledTimes(1);
  });

  it('re-queries after a provider:changed event invalidates the cache', async () => {
    const activeTypes = vi.fn().mockResolvedValue(new Set([MetadataProviderType.RADARR]));
    const eventBus = new DomainEventBus();
    const cache = new ActiveFieldSetCache({ providerSettingsService: { activeTypes }, eventBus });

    await cache.get();
    eventBus.emit('provider:changed', {});
    await cache.get();

    expect(activeTypes).toHaveBeenCalledTimes(2);
  });

  it('getActiveTypes() returns the underlying active provider-type set, cached', async () => {
    const activeTypes = vi.fn().mockResolvedValue(new Set([MetadataProviderType.RADARR]));
    const cache = new ActiveFieldSetCache({ providerSettingsService: { activeTypes } });

    const result = await cache.getActiveTypes();
    await cache.getActiveTypes();

    expect(result).toEqual(new Set([MetadataProviderType.RADARR]));
    expect(activeTypes).toHaveBeenCalledTimes(1);
  });
});
