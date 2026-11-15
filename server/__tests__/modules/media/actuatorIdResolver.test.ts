import { MetadataProviderType } from '@server/database/schema';
import { actuatorIdOf } from '@server/modules/media/actuatorIdResolver';
import type { LibraryCopy } from '@server/modules/media/libraryCache';
import { describe, expect, it } from 'vitest';

const copy = (links: LibraryCopy['links']) => ({ links }) as LibraryCopy;

describe('actuatorIdOf', () => {
  it('addresses Plex and Tautulli by the title’s Plex rating key', () => {
    const linked = copy({ plexRatingKey: '408', jellyfinItemId: 'jf-1' });
    expect(actuatorIdOf(linked, MetadataProviderType.PLEX)).toBe('408');
    expect(actuatorIdOf(linked, MetadataProviderType.TAUTULLI)).toBe('408');
  });

  it('addresses Jellyfin by the title’s Jellyfin item id', () => {
    const linked = copy({ plexRatingKey: '408', jellyfinItemId: 'jf-1' });
    expect(actuatorIdOf(linked, MetadataProviderType.JELLYFIN)).toBe('jf-1');
  });

  it('is undefined for a title the server is not linked to', () => {
    expect(
      actuatorIdOf(copy({ plexRatingKey: null, jellyfinItemId: null }), MetadataProviderType.PLEX)
    ).toBeUndefined();
  });

  it('throws for a provider type with no actuator addressing space', () => {
    expect(() =>
      actuatorIdOf(copy({ plexRatingKey: null, jellyfinItemId: null }), MetadataProviderType.SEERR)
    ).toThrow(/addressing space/);
  });
});
