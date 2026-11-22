import { MetadataProviderType } from '@server/database/schema';
import { resolveFacts } from '@server/modules/media/enrichmentMerge';
import { describe, expect, it } from 'vitest';

describe('resolveFacts', () => {
  const JELLYFIN = 1;
  const PLEX = 2;
  const TAUTULLI = 3;
  const typeOf = new Map([
    [JELLYFIN, MetadataProviderType.JELLYFIN],
    [PLEX, MetadataProviderType.PLEX],
    [TAUTULLI, MetadataProviderType.TAUTULLI],
  ]);

  it('takes the higher-ranked kind, and between two of one kind the first connected, per title', () => {
    // The later-connected media server's facts come first, so storage order cannot decide.
    const resolved = resolveFacts(
      [
        { mediaIdentityId: 10, providerId: PLEX, field: 'studio', value: 'Plex Studio' },
        { mediaIdentityId: 10, providerId: PLEX, field: 'playCount', value: 2 },
        { mediaIdentityId: 20, providerId: PLEX, field: 'studio', value: 'Only on Plex' },
        { mediaIdentityId: 10, providerId: JELLYFIN, field: 'studio', value: 'Jellyfin Studio' },
        { mediaIdentityId: 10, providerId: JELLYFIN, field: 'playCount', value: 9 },
        { mediaIdentityId: 10, providerId: TAUTULLI, field: 'playCount', value: 5 },
      ],
      typeOf
    );

    expect(resolved.get(10)).toEqual({ studio: 'Jellyfin Studio', playCount: 5 });
    expect(resolved.get(20)).toEqual({ studio: 'Only on Plex' });
  });
});
