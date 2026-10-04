import type { MetadataProvider } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import type { DomainEventBus } from '../../kernel/eventBus';
import { getChildLogger } from '../../kernel/logger';
import {
  EnrichmentQueries,
  MediaQueryEngine,
  mediaSourceFor,
  resolveActuatorTargets,
} from '../media';
import type { MediaSource, MediaSourceFactory } from '../media';
import type { MediaQueryService } from '../mediaQueries';
import {
  type ActuatorTask,
  type IProviderFactory,
  ProviderFactory,
  type ProviderSettingsService,
  type RadarrProvider,
  type SonarrProvider,
  isMediaActuator,
  isMediaSourceType,
  readEnabledTaskIds,
} from '../providers';
import type { AutomationRunService, RunTargets } from './automationRunService';
import type { AutomationQueryDto, AutomationService } from './automationService';

const log = getChildLogger('AutomationExecutor');

export interface SystemTaskRunnerLike {
  run(taskId: string): Promise<number>;
}

interface ExecutorDeps {
  automationService: AutomationService;
  automationRunService: AutomationRunService;
  providerSettingsService: ProviderSettingsService;
  mediaQueryService: MediaQueryService;
  providerFactory?: IProviderFactory;
  mediaQueryEngine?: MediaQueryEngine;
  enrichmentQueries?: EnrichmentQueries;
  /** The owning-catalog sources a non-source actuator's query evaluates against. */
  mediaSourceFactory?: Pick<MediaSourceFactory, 'sourcesFor'>;
  db?: DrizzleDb;
  systemTaskRunner?: SystemTaskRunnerLike;
  eventBus?: DomainEventBus;
}

/** What a user run acts on: the task, its target items, and their actuator ids. */
interface RunPlan {
  task: ActuatorTask;
  targets: RunTargets;
  actuatorIds: Parameters<ActuatorTask['run']>[0];
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export class AutomationExecutor {
  private readonly automationService: AutomationService;
  private readonly automationRunService: AutomationRunService;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly mediaQueryService: MediaQueryService;
  private readonly providerFactory: IProviderFactory;
  private readonly mediaQueryEngine: MediaQueryEngine;
  private readonly mediaSourceFactory?: Pick<MediaSourceFactory, 'sourcesFor'>;
  private readonly db?: DrizzleDb;
  private readonly systemTaskRunner?: SystemTaskRunnerLike;
  private readonly eventBus?: DomainEventBus;
  private readonly inFlight = new Set<number>();

  constructor(deps: ExecutorDeps) {
    this.automationService = deps.automationService;
    this.automationRunService = deps.automationRunService;
    this.providerSettingsService = deps.providerSettingsService;
    this.mediaQueryService = deps.mediaQueryService;
    this.providerFactory = deps.providerFactory ?? new ProviderFactory();
    this.mediaQueryEngine =
      deps.mediaQueryEngine ??
      new MediaQueryEngine({
        db: deps.db,
        enrichmentQueries:
          deps.enrichmentQueries ?? (deps.db ? new EnrichmentQueries({ db: deps.db }) : undefined),
      });
    this.mediaSourceFactory = deps.mediaSourceFactory;
    this.db = deps.db;
    this.systemTaskRunner = deps.systemTaskRunner;
    this.eventBus = deps.eventBus;
  }

  async execute(automationId: number): Promise<void> {
    if (this.inFlight.has(automationId)) return;
    this.inFlight.add(automationId);

    let itemCount = 0;
    let kind: 'user' | 'system' = 'user';
    let taskId = '';
    let targets: RunTargets | undefined;

    try {
      const automation = await this.automationService.getById(automationId);
      kind = automation.kind;
      taskId = automation.taskId;

      this.eventBus?.emit('run:started', {
        automationId,
        kind,
        taskId: automation.taskId,
        startedAt: new Date(),
      });

      if (automation.kind === 'system') {
        if (!this.systemTaskRunner) {
          throw new Error('System automation requires a systemTaskRunner');
        }
        itemCount = await this.systemTaskRunner.run(automation.taskId);
        await this.recordResult(automationId, taskId, { itemCount, status: 'success', kind });

        this.emitDataChange(SYSTEM_TASKS[taskId]?.affects, itemCount);

        log.info('System automation executed', {
          automationId,
          taskId: automation.taskId,
          itemCount,
        });
        return;
      }

      if (!automation.provider) {
        throw new Error(`Automation ${automationId} has no provider — cannot execute`);
      }

      const automationQueries = automation.queries ?? [];

      if (!automationQueries.length) {
        throw new Error(`Automation ${automationId} has no queries — cannot execute`);
      }

      const providerSettings = await this.providerSettingsService.findById(automation.provider.id);
      const plan = await this.planRun(automation.taskId, providerSettings, automationQueries);
      targets = plan.targets;
      itemCount = targets.items.length;
      await plan.task.run(plan.actuatorIds, automation.taskParameter);
      await this.recordResult(automationId, taskId, {
        itemCount,
        status: 'success',
        kind,
        targets,
      });

      this.emitDataChange(plan.task.affects, itemCount);

      log.info('Automation executed', { automationId, taskId: automation.taskId, itemCount });
    } catch (err) {
      log.error('Automation execution failed', { automationId, err });
      await this.recordResult(automationId, taskId, {
        itemCount,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        kind,
        targets,
      });
    } finally {
      this.inFlight.delete(automationId);
    }
  }

  /**
   * Decides what a user run acts on: the enabled task, the catalog items the
   * query targets, and those items in the actuator's own id space. Running the
   * task is the caller's step, so the targets are known even if the task fails.
   */
  private async planRun(
    taskId: string,
    providerSettings: MetadataProvider,
    automationQueries: AutomationQueryDto[]
  ): Promise<RunPlan> {
    const queryDtos = await Promise.all(
      automationQueries.map((automationQuery) =>
        this.mediaQueryService.getById(automationQuery.queryId)
      )
    );
    const contentType = queryDtos[0].contentType;
    const querySpecs = automationQueries.map((automationQuery, i) => ({
      filters: queryDtos[i].filters,
      role: automationQuery.role,
    }));

    const provider = this.providerFactory.create(providerSettings, log);
    if (!isMediaActuator(provider)) {
      throw new Error(`Provider instance ${providerSettings.id} declares no actuator tasks`);
    }
    const task = provider.tasks().find((t) => t.id === taskId);
    if (!task) throw new Error(`Task "${taskId}" is not yet implemented`);

    if (!readEnabledTaskIds(providerSettings.settings).includes(taskId)) {
      throw new Error(
        `Task "${taskId}" is not enabled on provider instance ${providerSettings.id}`
      );
    }

    if (isMediaSourceType(providerSettings.type)) {
      // Catalog-owning actuator: the query evaluates against its own catalog
      // and its native ids feed the task directly, one target per native id.
      const mediaSource = mediaSourceFor(
        provider as RadarrProvider | SonarrProvider,
        providerSettings.id
      );
      const matched = await this.mediaQueryEngine.evaluate({
        source: mediaSource,
        contentType,
        clauses: querySpecs,
      });
      const targetById = new Map(matched.map((item) => [mediaSource.idOf(item)!, item]));
      return {
        task,
        targets: { contentType, items: [...targetById.values()] },
        actuatorIds: [...targetById.keys()],
      };
    }

    // Non-source actuator: it owns no catalog, so the query evaluates against
    // the content type's owning source instances (pooled), and matched items
    // translate into the actuator's own addressing space through the identity
    // graph. Unstamped identities drop out — the task never receives an id it
    // cannot address.
    if (!this.mediaSourceFactory || !this.db) {
      throw new Error(
        `Task "${taskId}" on provider instance ${providerSettings.id} needs the owning-source catalog and identity graph to resolve ids`
      );
    }
    const entries = await this.mediaSourceFactory.sourcesFor(contentType);
    const pooled: MediaSource = {
      getMediaItems: async () =>
        (await Promise.all(entries.map((e) => e.source.getMediaItems()))).flat(),
      idOf: () => undefined,
    };
    const matched = await this.mediaQueryEngine.evaluate({
      source: pooled,
      contentType,
      clauses: querySpecs,
    });
    const { actuatorIds, addressed } = await resolveActuatorTargets(
      this.db,
      providerSettings.type,
      matched
    );
    return { task, targets: { contentType, items: addressed }, actuatorIds };
  }

  /**
   * Emits the namespaced `<scope>:changed` event when a run with a declared data
   * scope actually changed items. The payload is empty — consumers evict the whole
   * scope, so the event need only signal *that* the scope changed.
   */
  private emitDataChange(affects: 'media' | undefined, itemCount: number): void {
    if (affects && itemCount > 0) {
      this.eventBus?.emit(`${affects}:changed`, {});
    }
  }

  private async recordResult(
    automationId: number,
    taskId: string,
    result: {
      itemCount: number;
      status: 'success' | 'error';
      error?: string;
      kind: 'user' | 'system';
      targets?: RunTargets;
    }
  ): Promise<void> {
    const [, run] = await Promise.all([
      this.automationService.recordRun(automationId, result),
      this.automationRunService.createRun({
        automationId,
        status: result.status,
        itemCount: result.itemCount,
        error: result.error,
        kind: result.kind,
        targets: result.targets,
      }),
    ]);

    this.eventBus?.emit('run:completed', {
      automationId,
      kind: result.kind,
      taskId,
      status: result.status,
      itemCount: result.itemCount,
      error: result.error,
      finishedAt: new Date(),
      runId: run.id,
      ranAt: run.ranAt,
    });
  }
}

// System data jobs span every source, so they declare scope but no sourceType —
// a `media:changed` from here evicts both movie and series caches.
export const SYSTEM_TASKS: Record<string, { affects?: 'media' }> = {
  'system:enrichment': { affects: 'media' },
  'system:identity-resolution': { affects: 'media' },
};
