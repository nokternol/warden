import { apiUrlOf, hostOf } from '@contract/providerUrl';
import { describe, expect, it } from 'vitest';

describe('provider URLs', () => {
  it('joins a host and an API path, dropping trailing slashes from the host', () => {
    expect(apiUrlOf('http://radarr:7878//', '/api/v3')).toBe('http://radarr:7878/api/v3');
    expect(apiUrlOf('http://plex:32400/', '')).toBe('http://plex:32400');
  });

  it('recovers the host from a stored URL', () => {
    expect(hostOf('http://radarr:7878/api/v3', '/api/v3')).toBe('http://radarr:7878');
    expect(hostOf('http://plex:32400', '')).toBe('http://plex:32400');
    expect(hostOf('http://custom:1/other', '/api/v3')).toBe('http://custom:1/other');
  });
});
