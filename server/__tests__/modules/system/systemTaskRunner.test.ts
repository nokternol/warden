import { SystemTaskRunner } from '@server/modules/system/systemTaskRunner';
import type {
  CatalogRefreshJobFactoryLike,
  CatalogRefreshJobLike,
  EnrichmentJobFactoryLike,
  EnrichmentJobLike,
} from '@server/modules/system/systemTaskRunner';
import { describe, expect, it, vi } from 'vitest';

function makeCatalogRefreshJob(counts?: {
  movies?: number;
  series?: number;
  plex?: number;
  jellyfin?: number;
}): CatalogRefreshJobLike {
  return {
    runForMovies: vi.fn(async () => counts?.movies ?? 0),
    runForSeries: vi.fn(async () => counts?.series ?? 0),
    runForPlex: vi.fn(async () => counts?.plex ?? 0),
    runForJellyfin: vi.fn(async () => counts?.jellyfin ?? 0),
    runForLists: vi.fn(async () => 0),
    failedProviders: vi.fn(() => []),
  };
}

function makeEnrichmentJob(count = 0): EnrichmentJobLike {
  return { run: vi.fn(async () => count) };
}

function factoryReturning<T>(job: T): { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn(async () => job) };
}

function makeRunner(overrides?: {
  catalogRefreshJob?: CatalogRefreshJobLike;
  enrichmentJob?: EnrichmentJobLike;
}): {
  runner: SystemTaskRunner;
  catalogRefreshJob: CatalogRefreshJobLike;
  enrichmentJob: EnrichmentJobLike;
  catalogRefreshJobFactory: CatalogRefreshJobFactoryLike & { create: ReturnType<typeof vi.fn> };
  enrichmentJobFactory: EnrichmentJobFactoryLike & { create: ReturnType<typeof vi.fn> };
} {
  const catalogRefreshJob = overrides?.catalogRefreshJob ?? makeCatalogRefreshJob();
  const enrichmentJob = overrides?.enrichmentJob ?? makeEnrichmentJob();
  const catalogRefreshJobFactory = factoryReturning(catalogRefreshJob);
  const enrichmentJobFactory = factoryReturning(enrichmentJob);
  const runner = new SystemTaskRunner({ catalogRefreshJobFactory, enrichmentJobFactory });
  return {
    runner,
    catalogRefreshJob,
    enrichmentJob,
    catalogRefreshJobFactory,
    enrichmentJobFactory,
  };
}

describe('SystemTaskRunner', () => {
  it('dispatches system:identity-resolution through the identity job factory', async () => {
    const { runner, catalogRefreshJob, catalogRefreshJobFactory } = makeRunner();

    await runner.run('system:identity-resolution');

    expect(catalogRefreshJobFactory.create).toHaveBeenCalledTimes(1);
    expect(catalogRefreshJob.runForMovies).toHaveBeenCalledTimes(1);
    expect(catalogRefreshJob.runForSeries).toHaveBeenCalledTimes(1);
    expect(catalogRefreshJob.runForPlex).toHaveBeenCalledTimes(1);
    expect(catalogRefreshJob.runForJellyfin).toHaveBeenCalledTimes(1);
  });

  it('dispatches system:enrichment through the enrichment job factory', async () => {
    const { runner, enrichmentJob, enrichmentJobFactory } = makeRunner();

    await runner.run('system:enrichment');

    expect(enrichmentJobFactory.create).toHaveBeenCalledTimes(1);
    expect(enrichmentJob.run).toHaveBeenCalledTimes(1);
  });

  it('does not build the unrelated job when dispatching a task', async () => {
    const { runner, enrichmentJobFactory } = makeRunner();

    await runner.run('system:identity-resolution');

    expect(enrichmentJobFactory.create).not.toHaveBeenCalled();
  });

  it('returns the enrichment job count for system:enrichment', async () => {
    const { runner } = makeRunner({ enrichmentJob: makeEnrichmentJob(7) });

    expect(await runner.run('system:enrichment')).toBe(7);
  });

  it('returns the sum of every identity pass count for system:identity-resolution', async () => {
    const { runner } = makeRunner({
      catalogRefreshJob: makeCatalogRefreshJob({ movies: 3, series: 4, plex: 2, jellyfin: 5 }),
    });

    expect(await runner.run('system:identity-resolution')).toBe(14);
  });

  it('throws for an unknown task id', async () => {
    const { runner } = makeRunner();

    await expect(runner.run('system:does-not-exist')).rejects.toThrow(
      'Task "system:does-not-exist" is not yet implemented'
    );
  });
});
