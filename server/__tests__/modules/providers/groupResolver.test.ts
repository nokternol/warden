import { mediaIdentity } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { resolveGroup } from '@server/modules/providers/groupResolver';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

describe('resolveGroup', () => {
  beforeEach(async () => {
    await initializeDatabase(testConfig);
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  it('creates a new group carrying every known id when the primary id has no match', async () => {
    const db = getDb();

    const id = await resolveGroup(db, 'movie', {
      tmdbId: 603,
      imdbId: 'tt0133093',
      title: 'The Matrix',
      year: 1999,
    });

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.id, id));
    expect(row.kind).toBe('movie');
    expect(row.tmdbId).toBe(603);
    expect(row.imdbId).toBe('tt0133093');
    expect(row.title).toBe('The Matrix');
    expect(row.year).toBe(1999);
  });

  it('finds the existing group by primary id per kind instead of creating a duplicate', async () => {
    const db = getDb();
    const first = await resolveGroup(db, 'movie', { tmdbId: 603, title: 'The Matrix' });

    const second = await resolveGroup(db, 'movie', { tmdbId: 603, title: 'The Matrix' });

    expect(second).toBe(first);
    const rows = await db.select().from(mediaIdentity);
    expect(rows).toHaveLength(1);
  });

  it('scopes the primary id by kind — a movie and a show may share a numeric tmdb/tvdb id', async () => {
    const db = getDb();
    const movieId = await resolveGroup(db, 'movie', { tmdbId: 603 });
    const showId = await resolveGroup(db, 'series', { tvdbId: 603 });

    expect(movieId).not.toBe(showId);
    expect(await db.select().from(mediaIdentity)).toHaveLength(2);
  });

  it('fills a NULL identifier column on the matched group but never overwrites a conflicting value', async () => {
    const db = getDb();
    const id = await resolveGroup(db, 'movie', { tmdbId: 603, title: 'The Matrix' });

    // Second pass supplies imdbId (group's column is NULL) and a different title (group's
    // column is already set) — imdbId fills in, title is left alone.
    await resolveGroup(db, 'movie', { tmdbId: 603, imdbId: 'tt0133093', title: 'Wrong Title' });

    const [row] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.id, id));
    expect(row.imdbId).toBe('tt0133093');
    expect(row.title).toBe('The Matrix');
  });

  it('falls back to matching by imdbId when no primary id is given', async () => {
    const db = getDb();
    const withPrimary = await resolveGroup(db, 'movie', { tmdbId: 603, imdbId: 'tt0133093' });

    const fallback = await resolveGroup(db, 'movie', { imdbId: 'tt0133093' });

    expect(fallback).toBe(withPrimary);
  });

  it('falls back to matching by (kind, title, year) when no primary id or imdbId match', async () => {
    const db = getDb();
    const first = await resolveGroup(db, 'movie', { title: 'The Matrix', year: 1999 });

    const second = await resolveGroup(db, 'movie', { title: 'The Matrix', year: 1999 });

    expect(second).toBe(first);
  });

  it('creates a fresh group when nothing in the fallback chain matches', async () => {
    const db = getDb();
    const first = await resolveGroup(db, 'movie', { title: 'The Matrix', year: 1999 });

    const second = await resolveGroup(db, 'movie', { title: 'A Different Film', year: 2001 });

    expect(second).not.toBe(first);
    expect(await db.select().from(mediaIdentity)).toHaveLength(2);
  });

  it('never merges two existing groups — an imdbId match onto a group with its own primary id only attaches, leaving the other group untouched', async () => {
    const db = getDb();
    const groupA = await resolveGroup(db, 'movie', { tmdbId: 603, imdbId: 'tt0133093' });
    const groupB = await resolveGroup(db, 'movie', { tmdbId: 604, title: 'Other' });

    // Resolving by groupA's imdbId (no primary id given) must land on groupA, not touch groupB.
    const resolved = await resolveGroup(db, 'movie', { imdbId: 'tt0133093' });

    expect(resolved).toBe(groupA);
    const [rowB] = await db.select().from(mediaIdentity).where(eq(mediaIdentity.id, groupB));
    expect(rowB.tmdbId).toBe(604);
    expect(await db.select().from(mediaIdentity)).toHaveLength(2);
  });
});
