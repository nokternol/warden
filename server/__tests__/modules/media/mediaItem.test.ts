import { externalIdOf, itemKey } from '@server/modules/media/mediaItem';
import type { NormalizedMovie } from '@server/modules/media/movie';
import type { NormalizedSeries } from '@server/modules/media/series';
import { describe, expect, it } from 'vitest';

describe('externalIdOf', () => {
  it('reads the provider-native id off a Radarr-sourced item', () => {
    const item: NormalizedMovie = { _sourceIds: { radarr: 42, providerId: 1 }, title: 'M' };
    expect(externalIdOf(item)).toBe(42);
  });

  it('reads the provider-native id off a Sonarr-sourced item', () => {
    const item: NormalizedSeries = { _sourceIds: { sonarr: 7, providerId: 1 }, title: 'S' };
    expect(externalIdOf(item)).toBe(7);
  });

  it('is undefined for an item with no source-produced id', () => {
    const item: NormalizedMovie = { _sourceIds: {}, title: 'M' };
    expect(externalIdOf(item)).toBeUndefined();
  });
});

describe('itemKey', () => {
  it('combines providerId and externalId into a collision-free pool key', () => {
    const item: NormalizedMovie = { _sourceIds: { radarr: 42, providerId: 3 }, title: 'M' };
    expect(itemKey(item)).toBe('3:42');
  });

  it('is undefined when providerId or externalId is missing', () => {
    const noProvider: NormalizedMovie = { _sourceIds: { radarr: 42 }, title: 'M' };
    expect(itemKey(noProvider)).toBeUndefined();
    const noExternal: NormalizedMovie = { _sourceIds: { providerId: 3 }, title: 'M' };
    expect(itemKey(noExternal)).toBeUndefined();
  });
});
