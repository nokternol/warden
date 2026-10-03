import type { AppConfig } from '@server/kernel/config';
import { TmdbService } from '@server/modules/providers/tmdbService';
import { server } from '@tests/mocks/server';
import { http, HttpResponse, delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: 'test-key',
  SESSION_SECRET: 'test-secret',
};

const TMDB_TRENDING_URL = 'https://api.themoviedb.org/3/trending/all/week';

describe('TmdbService', () => {
  let service: TmdbService;

  beforeEach(() => {
    service = new TmdbService({ config });
  });

  describe('getTrendingBackdrops()', () => {
    it('returns backdrop paths, excluding persons and items with no backdrop', async () => {
      server.use(
        http.get(TMDB_TRENDING_URL, () =>
          HttpResponse.json({
            results: [
              { backdrop_path: '/movie.jpg', media_type: 'movie' },
              { backdrop_path: '/show.jpg', media_type: 'tv' },
              { backdrop_path: '/person.jpg', media_type: 'person' },
              { media_type: 'movie' }, // no backdrop_path
            ],
          })
        )
      );

      const result = await service.getTrendingBackdrops();

      expect(result).toEqual(['/movie.jpg', '/show.jpg']);
    });

    it('deduplicates concurrent in-flight requests', async () => {
      let requestCount = 0;
      server.use(
        http.get(TMDB_TRENDING_URL, async () => {
          requestCount++;
          await delay(20);
          return HttpResponse.json({
            results: [{ backdrop_path: '/a.jpg', media_type: 'movie' }],
          });
        })
      );

      const [r1, r2] = await Promise.all([
        service.getTrendingBackdrops(),
        service.getTrendingBackdrops(),
      ]);

      expect(requestCount).toBe(1);
      expect(r1).toEqual(r2);
    });

    it('returns an empty array on network failure', async () => {
      server.use(
        http.get(TMDB_TRENDING_URL, () =>
          HttpResponse.json({ error: 'upstream error' }, { status: 500 })
        )
      );

      const result = await service.getTrendingBackdrops();

      expect(result).toEqual([]);
    });
  });

  describe('getImageUrl()', () => {
    it('returns original-size image URL by default', () => {
      expect(service.getImageUrl('/foo.jpg')).toBe('https://image.tmdb.org/t/p/original/foo.jpg');
    });

    it('returns w1280-size image URL when requested', () => {
      expect(service.getImageUrl('/foo.jpg', 'w1280')).toBe(
        'https://image.tmdb.org/t/p/w1280/foo.jpg'
      );
    });
  });
});
