import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlexOAuth } from '../plexOAuth';

const PINS_URL = 'https://plex.tv/api/v2/pins';
const PIN_ID = 7;

describe('PlexOAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('test-client-id'),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a client id on a plain HTTP page, where crypto.randomUUID does not exist', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn().mockReturnValue(null), setItem });
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
    });

    new PlexOAuth();

    expect(setItem).toHaveBeenCalledWith('plex-client-id', '07'.repeat(16));
  });

  describe('getPin()', () => {
    it('posts to plex.tv and returns id and code', async () => {
      server.use(http.post(`${PINS_URL}`, () => HttpResponse.json({ id: PIN_ID, code: 'abc123' })));

      const oauth = new PlexOAuth();
      const pin = await oauth.getPin();

      expect(pin).toEqual({ id: PIN_ID, code: 'abc123' });
    });
  });

  describe('pollForToken()', () => {
    it('resolves with the authToken when the pin is claimed', async () => {
      server.use(
        http.post(PINS_URL, () => HttpResponse.json({ id: PIN_ID, code: 'abc123' })),
        http.get(`${PINS_URL}/${PIN_ID}`, () => HttpResponse.json({ authToken: 'plex-token-xyz' }))
      );

      const oauth = new PlexOAuth();
      await oauth.getPin();
      const token = await oauth.pollForToken();

      expect(token).toBe('plex-token-xyz');
    });

    it('rejects if the pin poll returns an HTTP error', async () => {
      server.use(
        http.post(PINS_URL, () => HttpResponse.json({ id: PIN_ID, code: 'abc123' })),
        http.get(`${PINS_URL}/${PIN_ID}`, () =>
          HttpResponse.json({ error: 'gone' }, { status: 404 })
        )
      );

      const oauth = new PlexOAuth();
      await oauth.getPin();

      await expect(oauth.pollForToken()).rejects.toThrow();
    });
  });
});
