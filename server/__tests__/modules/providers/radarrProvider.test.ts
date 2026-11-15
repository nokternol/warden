import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { RadarrProvider } from '@server/modules/providers/connections/radarrProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const mockLogger = getChildLogger('TestRadarrProvider');

const RADARR_BASE = 'http://localhost:7878/api/v3';

const mockConfig: ProviderConfig = {
  name: 'Test Radarr',
  url: RADARR_BASE,
  apiKey: 'fake-api-key',
  settings: {},
};

afterEach(() => server.resetHandlers());

describe('RadarrProvider', () => {
  const provider = new RadarrProvider(mockConfig, mockLogger);

  it('fetches and parses movies correctly', async () => {
    const movies = await provider.getMovies();
    expect(movies).toHaveLength(1);
    expect(movies[0].title).toBe('The Matrix');
    expect(movies[0].tmdbId).toBe(603);
  });

  it('fetches and parses quality profiles correctly', async () => {
    const profiles = await provider.getProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe('HD-1080p');
  });

  it('fetches and parses root folders correctly', async () => {
    const folders = await provider.getRootFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].path).toBe('/movies');
  });

  it('fetches and parses tags correctly', async () => {
    const tags = await provider.getTags();
    expect(tags).toHaveLength(2);
    expect(tags[0].label).toBe('action');
  });
});

describe('RadarrProvider — task methods', () => {
  const provider = new RadarrProvider(mockConfig, mockLogger);

  it('triggerMoviesSearch posts MoviesSearch command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${RADARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 99 });
      })
    );

    await provider.triggerMoviesSearch([1, 2, 3]);

    expect(commandBody).toEqual({ name: 'MoviesSearch', movieIds: [1, 2, 3] });
  });

  it('deleteMovies sends DELETE /movie/{id} with deleteFiles=true for each ID', async () => {
    const deleted: Array<{ id: number; deleteFiles: string | null }> = [];
    server.use(
      http.delete(`${RADARR_BASE}/movie/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        deleted.push({ id: Number(params.id), deleteFiles: url.searchParams.get('deleteFiles') });
        return HttpResponse.json({});
      })
    );

    await provider.deleteMovies([4, 5]);

    expect(deleted.map((d) => d.id)).toEqual(expect.arrayContaining([4, 5]));
    expect(deleted.every((d) => d.deleteFiles === 'true')).toBe(true);
  });

  it('deleteMoviesKeepFiles sends DELETE /movie/{id} with deleteFiles=false for each ID', async () => {
    const deleted: Array<{ id: number; deleteFiles: string | null }> = [];
    server.use(
      http.delete(`${RADARR_BASE}/movie/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        deleted.push({ id: Number(params.id), deleteFiles: url.searchParams.get('deleteFiles') });
        return HttpResponse.json({});
      })
    );

    await provider.deleteMoviesKeepFiles([6, 7]);

    expect(deleted.map((d) => d.id)).toEqual(expect.arrayContaining([6, 7]));
    expect(deleted.every((d) => d.deleteFiles === 'false')).toBe(true);
  });

  it('refreshMovies posts RefreshMovie command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${RADARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.refreshMovies([1, 2]);

    expect(commandBody).toEqual({ name: 'RefreshMovie', movieIds: [1, 2] });
  });

  it('rescanMovies posts RescanMovie command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${RADARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.rescanMovies([3]);

    expect(commandBody).toEqual({ name: 'RescanMovie', movieIds: [3] });
  });

  it('renameMovies posts RenameMovies command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${RADARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.renameMovies([4, 5]);

    expect(commandBody).toEqual({ name: 'RenameMovies', movieIds: [4, 5] });
  });

  it('refreshCollections posts RefreshCollections command with no item scope', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${RADARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.refreshCollections();

    expect(commandBody).toEqual({ name: 'RefreshCollections' });
  });

  it('unmonitorMovies sends PUT /movie/{id} with monitored:false for each ID', async () => {
    const putBodies: Array<{ id: number; monitored: boolean }> = [];
    server.use(
      http.get(`${RADARR_BASE}/movie`, () =>
        HttpResponse.json([
          {
            id: 1,
            title: 'Movie A',
            monitored: true,
            hasFile: true,
            tags: [],
            qualityProfileId: 1,
            profileId: 1,
            tmdbId: 1,
            folderName: '',
            path: '',
          },
          {
            id: 2,
            title: 'Movie B',
            monitored: true,
            hasFile: true,
            tags: [],
            qualityProfileId: 1,
            profileId: 1,
            tmdbId: 2,
            folderName: '',
            path: '',
          },
        ])
      ),
      http.put(`${RADARR_BASE}/movie/:id`, async ({ params, request }) => {
        const body = (await request.json()) as { monitored: boolean };
        putBodies.push({ id: Number(params.id), monitored: body.monitored });
        return HttpResponse.json({ id: Number(params.id) });
      })
    );

    await provider.unmonitorMovies([1, 2]);

    expect(putBodies).toHaveLength(2);
    expect(putBodies.every((b) => b.monitored === false)).toBe(true);
    expect(putBodies.map((b) => b.id)).toEqual(expect.arrayContaining([1, 2]));
  });
});

describe('RadarrProvider — parameterized tasks', () => {
  const provider = new RadarrProvider(mockConfig, mockLogger);
  const task = (id: string) => provider.tasks().find((t) => t.id === id)!;

  function stubEditor() {
    const bodies: unknown[] = [];
    server.use(
      http.put(`${RADARR_BASE}/movie/editor`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json([]);
      })
    );
    return bodies;
  }

  it('declares parameters on changeQualityProfile, addTag, removeTag', () => {
    expect(task('changeQualityProfile').parameter).toEqual({
      type: 'select',
      label: 'Quality profile',
      optionsRoute: 'quality-profiles',
    });
    expect(task('addTag').parameter).toEqual({
      type: 'select',
      label: 'Tag',
      optionsRoute: 'tags',
    });
    expect(task('removeTag').parameter).toEqual({
      type: 'select',
      label: 'Tag',
      optionsRoute: 'tags',
    });
  });

  it('changeQualityProfile bulk-edits the movies to the given profile', async () => {
    const bodies = stubEditor();

    await task('changeQualityProfile').run([1, 2], '7');

    expect(bodies).toEqual([{ movieIds: [1, 2], qualityProfileId: 7 }]);
  });

  it('addTag applies the tag to the movies', async () => {
    const bodies = stubEditor();

    await task('addTag').run([3], '11');

    expect(bodies).toEqual([{ movieIds: [3], tags: [11], applyTags: 'add' }]);
  });

  it('removeTag removes the tag from the movies', async () => {
    const bodies = stubEditor();

    await task('removeTag').run([3, 4], '11');

    expect(bodies).toEqual([{ movieIds: [3, 4], tags: [11], applyTags: 'remove' }]);
  });

  it('each parameterized task rejects without its value', async () => {
    for (const id of ['changeQualityProfile', 'addTag', 'removeTag']) {
      await expect(task(id).run([1])).rejects.toThrow(/requires a parameter/i);
    }
  });
});

describe('RadarrProvider — deleting a movie already gone', () => {
  const provider = new RadarrProvider(mockConfig, mockLogger);

  it('counts a delete answered 404 as done, with or without files', async () => {
    server.use(
      http.delete(`${RADARR_BASE}/movie/:id`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(provider.deleteMovies([4])).resolves.toBeUndefined();
    await expect(provider.deleteMoviesKeepFiles([4])).resolves.toBeUndefined();
  });
});
