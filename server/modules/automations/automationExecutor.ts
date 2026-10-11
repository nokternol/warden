import type { AutomationPreview } from '@contract/automations';
import type { ContentType } from '@contract/schemas';
import type { MetadataProvider } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ValidationError } from '../../kernel/errors';
import type { DomainEventBus } from '../../kernel/eventBus';
import { getChildLogger } from '../../kernel/logger';
import {
  EnrichmentQueries,
  MediaQueryEngine,
  getRule,
  mediaSourceFor,
  resolveActuatorTargets,
} from '../media';
import type { MediaSource, MediaSourceFactory } from '../media';
import type { MediaQueryService, QueryHealth } from '../mediaQueries';
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

/** One query an automation targets with, by id and role. */
type TargetingQuery = Pick<AutomationQueryDto, 'queryId' | 'role'>;

/** What a user run acts on: the task, its target items, and their actuator ids. */
interface RunPlan {
  task: ActuatorTask;
  targets: RunTargets;
  actuatorIds: Parameters<ActuatorTask['run']>[0];
}

/** "RADARR" as "Radarr". */
function providerTypeName(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/** "Radarr instance 3" — a provider instance named by its type and id. */
function instanceName(type: string | undefined, providerId: number): string {
  return `${type ? providerTypeName(type) : 'Provider'} instance ${providerId}`;
}

type ProviderStatus = QueryHealth['providerStatus'][number];
type QualificationIssue = QueryHealth['qualificationIssues'][number];

/** One line saying which rule needs a provider type that is not configured. */
function describeMissingProvider(
  { providerType, affectedFilterKeys }: ProviderStatus,
  contentType: ContentType
): string {
  const rule = getRule(affectedFilterKeys[0], contentType);
  return `${rule?.label} filter needs a ${providerTypeName(providerType)} provider, which is not configured`;
}

/** One line saying why a filter's instance qualification keeps the automation from running. */
function describeQualificationIssue(
  { filterKey, providerId, reason }: QualificationIssue,
  contentType: ContentType,
  automationProvider: MetadataProvider
): string {
  const rule = getRule(filterKey, contentType);
  const filter = `${rule?.label} filter names ${instanceName(rule?.providers[0], providerId)}`;
  return reason === 'not_active'
    ? `${filter}, which is not an active provider`
    : `${filter}, which is not this automation's provider (${instanceName(automationProvider.type, automationProvider.id)})`;
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
      const problems = await this.blockingProblems(providerSettings, automationQueries);
      if (problems.length > 0) {
        await this.recordSkip(automationId, taskId, problems.join('; '));
        return;
      }
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

  /** Records that an invalid user automation was not run, and why. */
  private async recordSkip(automationId: number, taskId: string, reason: string): Promise<void> {
    log.warn('Automation skipped as invalid', { automationId, reason });
    await this.recordResult(automationId, taskId, {
      itemCount: 0,
      status: 'skipped',
      error: reason,
      kind: 'user',
    });
  }

  /** Why a user automation cannot run, one line per problem; empty when it can. */
  private async blockingProblems(
    automationProvider: MetadataProvider,
    automationQueries: TargetingQuery[]
  ): Promise<string[]> {
    const automationProviderId = automationProvider.id;
    const problems: string[] = [];
    if (!automationProvider.isActive) {
      problems.push(
        `${instanceName(automationProvider.type, automationProviderId)}, this automation's provider, is not an active provider`
      );
    }
    for (const { queryId } of automationQueries) {
      const { contentType } = await this.mediaQueryService.getById(queryId);
      const health = await this.mediaQueryService.getHealthForAutomation(
        queryId,
        automationProviderId
      );
      for (const status of health.providerStatus) {
        if (status.required && !status.configured) {
          problems.push(describeMissingProvider(status, contentType));
        }
      }
      for (const issue of health.qualificationIssues) {
        problems.push(describeQualificationIssue(issue, contentType, automationProvider));
      }
    }
    return problems;
  }

  /**
   * What an unsaved automation would act on if it ran now: the same plan a run
   * makes, counted in the actuator's own ids, without running the task.
   */
  async preview(draft: {
    providerId: number;
    taskId: string;
    queries: TargetingQuery[];
  }): Promise<AutomationPreview> {
    const providerSettings = await this.providerSettingsService.findById(draft.providerId);
    const plan = await this.planRun(draft.taskId, providerSettings, draft.queries);
    return { count: plan.actuatorIds.length, contentType: plan.targets.contentType };
  }

  /**
   * Decides what a user run acts on: the enabled task, the catalog items the
   * query targets, and those items in the actuator's own id space. Running the
   * task is the caller's step, so the targets are known even if the task fails.
   */
  private async planRun(
    taskId: string,
    providerSettings: MetadataProvider,
    automationQueries: TargetingQuery[]
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
      throw new ValidationError(
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
      status: 'success' | 'error' | 'skipped';
      error?: string;
      kind: 'user' | 'system';
      targets?: RunTargets;
    }
  ): Promise<void> {
    // A skip describes the automation's validity, not an execution, so the
    // last-run summary keeps describing the last run that did execute.
    const [, run] = await Promise.all([
      result.status === 'skipped'
        ? undefined
        : this.automationService.recordRun(automationId, { ...result, status: result.status }),
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
