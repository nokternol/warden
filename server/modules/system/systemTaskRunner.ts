export interface IdentityJobLike {
  runForMovies(): Promise<number>;
  runForSeries(): Promise<number>;
  runForPlex(): Promise<number>;
  runForJellyfin(): Promise<number>;
  /** The providers the run could not refresh, by name. */
  failedProviders(): string[];
}

export interface EnrichmentJobLike {
  run(): Promise<number>;
}

export interface IdentityJobFactoryLike {
  create(): Promise<IdentityJobLike>;
}

export interface EnrichmentJobFactoryLike {
  create(): Promise<EnrichmentJobLike>;
}

export interface SystemTaskRunnerDeps {
  identityJobFactory: IdentityJobFactoryLike;
  enrichmentJobFactory: EnrichmentJobFactoryLike;
}

export class SystemTaskRunner {
  private readonly identityJobFactory: IdentityJobFactoryLike;
  private readonly enrichmentJobFactory: EnrichmentJobFactoryLike;

  constructor(deps: SystemTaskRunnerDeps) {
    this.identityJobFactory = deps.identityJobFactory;
    this.enrichmentJobFactory = deps.enrichmentJobFactory;
  }

  async run(taskId: string): Promise<number> {
    if (taskId === 'system:identity-resolution') {
      const job = await this.identityJobFactory.create();
      const movies = await job.runForMovies();
      const series = await job.runForSeries();
      const plex = await job.runForPlex();
      const jellyfin = await job.runForJellyfin();
      const failed = job.failedProviders();
      if (failed.length > 0) throw new Error(`Could not refresh ${failed.join(', ')}`);
      return movies + series + plex + jellyfin;
    }
    if (taskId === 'system:enrichment') {
      const job = await this.enrichmentJobFactory.create();
      return await job.run();
    }
    throw new Error(`Task "${taskId}" is not yet implemented`);
  }
}
