/**
 * Verifies the migration that stops identities keyed on a TMDB or TVDB id of 0 from holding
 * unrelated titles together: the zero id is cleared, and so is every id such a group borrowed from
 * whichever copy joined it first, so the next identity run regroups those copies by title and year
 * and no actuator id can address the wrong title meanwhile. Healthy groups are untouched.
 */
import type { Client } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigration, databaseBefore } from '../database/migrationHarness';

const TAG = '0036_identity_zero_ids';
let client: Client | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
});

describe('migration 0036: identities keyed on a zero id', () => {
  it('clears zero primary ids and the ids those groups borrowed, leaving healthy groups alone', async () => {
    client = await databaseBefore(TAG);
    await client.executeMultiple(`
      INSERT INTO media_identity (id, kind, tvdbId, tmdbId, imdbId, tvMazeId, plexRatingKey, jellyfinItemId, title, year, enrichedAt)
        VALUES (1, 'series', 0, 77, 'tt-a', 9, 'rk-a', 'jf-a', 'Unlisted A', 2020, 100);
      INSERT INTO media_identity (id, kind, tmdbId, imdbId, plexRatingKey, title, year, enrichedAt)
        VALUES (2, 'movie', 0, 'tt-m', 'rk-m', 'Unlisted M', 2019, 100);
      INSERT INTO media_identity (id, kind, tvdbId, imdbId, plexRatingKey, title, year, enrichedAt)
        VALUES (3, 'series', 5, 'tt-5', 'rk-5', 'Listed', 2018, 100);
    `);

    await applyMigration(client, TAG);

    const rows = await client.execute(
      'SELECT id, tvdbId, tmdbId, imdbId, tvMazeId, plexRatingKey, jellyfinItemId, title, enrichedAt FROM media_identity ORDER BY id'
    );
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([
      {
        id: 1,
        tvdbId: null,
        tmdbId: null,
        imdbId: null,
        tvMazeId: null,
        plexRatingKey: null,
        jellyfinItemId: null,
        title: 'Unlisted A',
        enrichedAt: null,
      },
      {
        id: 2,
        tvdbId: null,
        tmdbId: null,
        imdbId: null,
        tvMazeId: null,
        plexRatingKey: null,
        jellyfinItemId: null,
        title: 'Unlisted M',
        enrichedAt: null,
      },
      {
        id: 3,
        tvdbId: 5,
        tmdbId: null,
        imdbId: 'tt-5',
        tvMazeId: null,
        plexRatingKey: 'rk-5',
        jellyfinItemId: null,
        title: 'Listed',
        enrichedAt: 100,
      },
    ]);
  });
});
