import { getChildLogger } from '@server/kernel/logger';
import type { ProviderConfig } from '@server/modules/providers/connections/baseProviderConnection';
import { SonarrProvider } from '@server/modules/providers/connections/sonarrProvider';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

const logger = getChildLogger('TestSonarrProvider');

const SONARR_BASE = 'http://localhost:8989/api/v3';

const mockConfig: ProviderConfig = {
  name: 'Test Sonarr',
  url: SONARR_BASE,
  apiKey: 'fake-api-key',
  settings: {},
};

afterEach(() => server.resetHandlers());

describe('SonarrProvider', () => {
  const provider = new SonarrProvider(mockConfig, logger);

  it('fetches and parses series correctly', async () => {
    const series = await provider.getSeries();
    expect(series).toHaveLength(1);
    expect(series[0].title).toBe('Breaking Bad');
    expect(series[0].tvdbId).toBe(81189);
  });

  it('fetches and parses quality profiles correctly', async () => {
    const profiles = await provider.getProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe('HD-1080p');
  });

  it('fetches and parses root folders correctly', async () => {
    const folders = await provider.getRootFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].path).toBe('/tv');
  });

  it('fetches and parses tags correctly', async () => {
    const tags = await provider.getTags();
    expect(tags).toHaveLength(1);
    expect(tags[0].label).toBe('drama');
  });

  it('fetches and parses language profiles correctly', async () => {
    server.use(
      http.get(`${SONARR_BASE}/languageprofile`, () =>
        HttpResponse.json([
          { id: 1, name: 'English' },
          { id: 2, name: 'English/Japanese' },
        ])
      )
    );

    const profiles = await provider.getLanguageProfiles();

    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe('English');
  });
});

describe('SonarrProvider — task methods', () => {
  const provider = new SonarrProvider(mockConfig, logger);

  it('triggerSeriesSearch posts one SeriesSearch command per series ID', async () => {
    const commandBodies: unknown[] = [];
    server.use(
      http.post(`${SONARR_BASE}/command`, async ({ request }) => {
        commandBodies.push(await request.json());
        return HttpResponse.json({ id: 99 });
      })
    );

    await provider.triggerSeriesSearch([1, 2]);

    expect(commandBodies).toHaveLength(2);
    expect(commandBodies).toEqual(
      expect.arrayContaining([
        { name: 'SeriesSearch', seriesId: 1 },
        { name: 'SeriesSearch', seriesId: 2 },
      ])
    );
  });

  it('deleteSeries sends DELETE /series/{id} with deleteFiles=true for each ID', async () => {
    const deleted: Array<{ id: number; deleteFiles: string | null }> = [];
    server.use(
      http.delete(`${SONARR_BASE}/series/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        deleted.push({ id: Number(params.id), deleteFiles: url.searchParams.get('deleteFiles') });
        return HttpResponse.json({});
      })
    );

    await provider.deleteSeries([7, 8]);

    expect(deleted.map((d) => d.id)).toEqual(expect.arrayContaining([7, 8]));
    expect(deleted.every((d) => d.deleteFiles === 'true')).toBe(true);
  });

  it('deleteSeriesKeepFiles sends DELETE /series/{id} with deleteFiles=false for each ID', async () => {
    const deleted: Array<{ id: number; deleteFiles: string | null }> = [];
    server.use(
      http.delete(`${SONARR_BASE}/series/:id`, ({ params, request }) => {
        const url = new URL(request.url);
        deleted.push({ id: Number(params.id), deleteFiles: url.searchParams.get('deleteFiles') });
        return HttpResponse.json({});
      })
    );

    await provider.deleteSeriesKeepFiles([6, 7]);

    expect(deleted.map((d) => d.id)).toEqual(expect.arrayContaining([6, 7]));
    expect(deleted.every((d) => d.deleteFiles === 'false')).toBe(true);
  });

  it('refreshSeries posts RefreshSeries command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${SONARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.refreshSeries([1, 2]);

    expect(commandBody).toEqual({ name: 'RefreshSeries', seriesIds: [1, 2] });
  });

  it('rescanSeries posts RescanSeries command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${SONARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.rescanSeries([3]);

    expect(commandBody).toEqual({ name: 'RescanSeries', seriesIds: [3] });
  });

  it('renameSeries posts RenameSeries command with given IDs', async () => {
    let commandBody: unknown = null;
    server.use(
      http.post(`${SONARR_BASE}/command`, async ({ request }) => {
        commandBody = await request.json();
        return HttpResponse.json({ id: 1 });
      })
    );

    await provider.renameSeries([4, 5]);

    expect(commandBody).toEqual({ name: 'RenameSeries', seriesIds: [4, 5] });
  });

  it('unmonitorSeries sends PUT /series/{id} with monitored:false for each ID', async () => {
    const putBodies: Array<{ id: number; monitored: boolean }> = [];
    server.use(
      http.get(`${SONARR_BASE}/series`, () =>
        HttpResponse.json([
          {
            id: 1,
            title: 'Show A',
            monitored: true,
            status: 'ended',
            tvdbId: 1,
            profileId: 1,
            qualityProfileId: 1,
            languageProfileId: 1,
            tags: [],
            path: '/tv/A',
            seasons: [],
          },
          {
            id: 2,
            title: 'Show B',
            monitored: true,
            status: 'ended',
            tvdbId: 2,
            profileId: 1,
            qualityProfileId: 1,
            languageProfileId: 1,
            tags: [],
            path: '/tv/B',
            seasons: [],
          },
        ])
      ),
      http.put(`${SONARR_BASE}/series/:id`, async ({ params, request }) => {
        const body = (await request.json()) as { monitored: boolean };
        putBodies.push({ id: Number(params.id), monitored: body.monitored });
        return HttpResponse.json({ id: Number(params.id) });
      })
    );

    await provider.unmonitorSeries([1, 2]);

    expect(putBodies).toHaveLength(2);
    expect(putBodies.every((b) => b.monitored === false)).toBe(true);
    expect(putBodies.map((b) => b.id)).toEqual(expect.arrayContaining([1, 2]));
  });
});

describe('SonarrProvider — parameterized tasks', () => {
  const provider = new SonarrProvider(mockConfig, logger);
  const task = (id: string) => provider.tasks().find((t) => t.id === id)!;

  function stubEditor() {
    const bodies: unknown[] = [];
    server.use(
      http.put(`${SONARR_BASE}/series/editor`, async ({ request }) => {
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

  it('changeQualityProfile bulk-edits the series to the given profile', async () => {
    const bodies = stubEditor();

    await task('changeQualityProfile').run([1, 2], '7');

    expect(bodies).toEqual([{ seriesIds: [1, 2], qualityProfileId: 7 }]);
  });

  it('addTag applies the tag to the series', async () => {
    const bodies = stubEditor();

    await task('addTag').run([3], '11');

    expect(bodies).toEqual([{ seriesIds: [3], tags: [11], applyTags: 'add' }]);
  });

  it('removeTag removes the tag from the series', async () => {
    const bodies = stubEditor();

    await task('removeTag').run([3, 4], '11');

    expect(bodies).toEqual([{ seriesIds: [3, 4], tags: [11], applyTags: 'remove' }]);
  });

  it('each parameterized task rejects without its value', async () => {
    for (const id of ['changeQualityProfile', 'addTag', 'removeTag']) {
      await expect(task(id).run([1])).rejects.toThrow(/requires a parameter/i);
    }
  });
});

describe('SonarrProvider — deleting a series already gone', () => {
  const provider = new SonarrProvider(mockConfig, logger);

  it('counts a delete answered 404 as done, with or without files', async () => {
    server.use(
      http.delete(`${SONARR_BASE}/series/:id`, () => new HttpResponse(null, { status: 404 }))
    );

    await expect(provider.deleteSeries([4])).resolves.toBeUndefined();
    await expect(provider.deleteSeriesKeepFiles([4])).resolves.toBeUndefined();
  });
});
