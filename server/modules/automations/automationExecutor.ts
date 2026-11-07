import type { AutomationPreview } from '@contract/automations';
import type { AutomationRunStatus } from '@contract/schemas';
import type { MetadataProvider } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ValidationError } from '../../kernel/errors';
import type { DomainEventBus } from '../../kernel/eventBus';
import { getChildLogger } from '../../kernel/logger';
import {
  EnrichmentQueries,
  MediaQueryEngine,
  automationAnswer,
  findingsFor,
  mediaSourceFor,
  resolveActuatorTargets,
} from '../media';
import type { FilterReadiness, MediaSource, MediaSourceFactory } from '../media';
import type { MediaQueryRecord, MediaQueryService } from '../mediaQueries';
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
import type { AutomationBlockService } from './automationBlockService';
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
  filterReadiness: Pick<FilterReadiness, 'readFacts'>;
  automationBlockService: Pick<AutomationBlockService, 'reconcile'>;
  providerFactory?: IProviderFactory;
  mediaQueryEngine?: MediaQueryEngine;
  enrichmentQueries?: EnrichmentQueries;
  /** The owning-catalog sources a non-source actuator's query evaluates against. */
  mediaSourceFactory?: Pick<MediaSourceFactory, 'sourcesFor'>;
  db?: DrizzleDb;
  systemTaskRunner?: SystemTaskRunnerLike;
  eventBus?: DomainEventBus;
}

/**
 * What started a run. A scheduled tick runs only once every finding is fixed or signed off. A Run
 * Now also runs past the findings awaiting sign-off that the user chose to proceed past.
 */
export type RunTrigger =
  | { trigger: 'schedule' }
  | { trigger: 'runNow'; consentedFindings?: readonly string[] };

/** One query an automation targets with, by id and role. */
type TargetingQuery = Pick<AutomationQueryDto, 'queryId' | 'role'>;

/** A targeting query with its saved record, loaded once for everything a run decides. */
type LoadedQuery = TargetingQuery & { record: MediaQueryRecord };

/** What a user run acts on: the task, its target items, and their actuator ids. */
interface RunPlan {
  task: ActuatorTask;
  targets: RunTargets;
  actuatorIds: Parameters<ActuatorTask['run']>[0];
  /** How many source copies the query was evaluated against, and how many it matched. */
  poolSize: number;
  matchedCount: number;
}

/** Below this many targets a destructive run is small enough to be its own limit. */
const REACH_CHECK_MIN_ITEMS = 20;

/**
 * Why a destructive run should not proceed: a query matching most of a library is almost always a
 * fault, such as data that failed to load, and nobody is watching a scheduled run to stop it.
 */
export function excessiveReach({
  task,
  matchedCount,
  poolSize,
}: Pick<RunPlan, 'task' | 'matchedCount' | 'poolSize'>): string | undefined {
  if (!task.destructive || matchedCount < REACH_CHECK_MIN_ITEMS) return undefined;
  if (matchedCount * 2 <= poolSize) return undefined;
  return `Not run: this would act on ${matchedCount} of ${poolSize} titles, more than half the library. Narrow its queries if that is intended.`;
}

/** A source that remembers how many items it returned. */
function counting(source: MediaSource): MediaSource & { count: () => number } {
  let count = 0;
  return {
    ...source,
    getMediaItems: async () => {
      const items = await source.getMediaItems();
      count = items.length;
      return items;
    },
    count: () => count,
  };
}

/** "RADARR" as "Radarr". */
function providerTypeName(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/** "Radarr instance 3" — a provider instance named by its type and id. */
function instanceName(type: string | undefined, providerId: number): string {
  return `${type ? providerTypeName(type) : 'Provider'} instance ${providerId}`;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export class AutomationExecutor {
  private readonly automationService: AutomationService;
  private readonly automationRunService: AutomationRunService;
  private readonly providerSettingsService: ProviderSettingsService;
  private readonly mediaQueryService: MediaQueryService;
  private readonly providerFactory: IProviderFactory;
  private readonly mediaQueryEngine: MediaQueryEngine;
  private readonly filterReadiness: Pick<FilterReadiness, 'readFacts'>;
  private readonly automationBlockService: Pick<AutomationBlockService, 'reconcile'>;
  private readonly mediaSourceFactory?: Pick<MediaSourceFactory, 'sourcesFor'>;
  private readonly db?: DrizzleDb;
  private readonly systemTaskRunner?: SystemTaskRunnerLike;
  private readonly eventBus?: DomainEventBus;
  private readonly inFlight = new Set<number>();
  private readonly providerTurns = new Map<number, Promise<void>>();

  constructor(deps: ExecutorDeps) {
    this.automationService = deps.automationService;
    this.automationRunService = deps.automationRunService;
    this.providerSettingsService = deps.providerSettingsService;
    this.mediaQueryService = deps.mediaQueryService;
    this.providerFactory = deps.providerFactory ?? new ProviderFactory();
    const enrichmentQueries =
      deps.enrichmentQueries ?? (deps.db ? new EnrichmentQueries({ db: deps.db }) : undefined);
    this.mediaQueryEngine =
      deps.mediaQueryEngine ??
      new MediaQueryEngine({
        db: deps.db,
        enrichmentQueries: enrichmentQueries,
      });
    this.filterReadiness = deps.filterReadiness;
    this.automationBlockService = deps.automationBlockService;
    this.mediaSourceFactory = deps.mediaSourceFactory;
    this.db = deps.db;
    this.systemTaskRunner = deps.systemTaskRunner;
    this.eventBus = deps.eventBus;
  }

  async execute(
    automationId: number,
    started: RunTrigger = { trigger: 'schedule' }
  ): Promise<void> {
    if (this.inFlight.has(automationId)) return;
    this.inFlight.add(automationId);

    let itemCount = 0;
    let kind: 'user' | 'system' = 'user';
    let taskId = '';
    let targets: RunTargets | undefined;
    let runId: number | undefined;

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

      // Runs through one provider take turns, so each plans against what the last one changed.
      await this.takeProviderTurn(automation.provider.id, async () => {
        // The wait may be long: what runs is the automation as it stands when its turn comes.
        const current = await this.automationService.getById(automationId);
        if (automation.status === 'active' && current.status !== 'active') return;
        const providerSettings = await this.providerSettingsService.findById(
          automation.provider!.id
        );
        const queries = await this.loadQueries(current.queries ?? []);
        const problems = await this.blockingProblems(
          automationId,
          providerSettings,
          queries,
          started
        );
        if (problems.length > 0) {
          const reason = problems.join('; ');
          // A blocked schedule keeps ticking to re-check; one skip says why until that changes.
          // A Run Now always records its outcome, so the user pressing it sees one.
          if (
            started.trigger === 'runNow' ||
            !(await this.lastRunSkippedFor(automationId, reason))
          ) {
            await this.recordSkip(automationId, taskId, reason);
          }
          return;
        }
        const plan = await this.planRun(current.taskId, providerSettings, queries);
        targets = plan.targets;
        itemCount = targets.items.length;
        const excess = excessiveReach(plan);
        if (excess) {
          await this.recordSkip(automationId, taskId, excess);
          return;
        }
        const run = await this.automationRunService.beginRun({ automationId, kind, targets });
        runId = run.id;
        try {
          await plan.task.run(plan.actuatorIds, current.taskParameter);
        } finally {
          // A task that fails partway has still changed upstream data for the items it reached.
          this.emitDataChange(plan.task.affects, itemCount);
        }
        await this.recordResult(
          automationId,
          taskId,
          { itemCount, status: 'success', kind, targets },
          runId
        );
      });

      log.info('Automation executed', { automationId, taskId: automation.taskId, itemCount });
    } catch (err) {
      log.error('Automation execution failed', { automationId, err });
      await this.recordResult(
        automationId,
        taskId,
        {
          itemCount,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
          kind,
          targets,
        },
        runId
      );
    } finally {
      this.inFlight.delete(automationId);
    }
  }

  /** Whether a run of this automation is underway, which a further trigger would not start. */
  isRunning(automationId: number): boolean {
    return this.inFlight.has(automationId);
  }

  private async takeProviderTurn(providerId: number, work: () => Promise<void>): Promise<void> {
    const previous = this.providerTurns.get(providerId) ?? Promise.resolve();
    const turn = previous.then(work, work);
    this.providerTurns.set(
      providerId,
      turn.catch(() => {})
    );
    await turn;
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

  private async lastRunSkippedFor(automationId: number, reason: string): Promise<boolean> {
    const [latest] = await this.automationRunService.listRuns({ automationId, limit: 1 });
    return latest?.status === 'skipped' && latest.error === reason;
  }

  private loadQueries(automationQueries: TargetingQuery[]): Promise<LoadedQuery[]> {
    return Promise.all(
      automationQueries.map(async (query) => ({
        ...query,
        record: await this.mediaQueryService.getById(query.queryId),
      }))
    );
  }

  /**
   * Why a user automation cannot run on this trigger, one line per problem; empty when it can.
   * Keeps the automation's stored blocks in step with the findings on the way.
   */
  private async blockingProblems(
    automationId: number,
    automationProvider: MetadataProvider,
    automationQueries: LoadedQuery[],
    run: RunTrigger
  ): Promise<string[]> {
    const problems: string[] = [];
    if (!automationProvider.isActive) {
      problems.push(
        `${instanceName(automationProvider.type, automationProvider.id)}, this automation's provider, is not an active provider`
      );
    }
    const facts = await this.filterReadiness.readFacts();
    const findings = automationQueries.flatMap(({ queryId, record }) =>
      findingsFor(
        facts,
        { queryId, contentType: record.contentType, filters: record.filters },
        { id: automationProvider.id, type: automationProvider.type }
      )
    );
    // Before any sign-off is known, every finding a user could accept awaits sign-off.
    const signOffable = automationAnswer(findings, new Set()).blocks.awaitingSignOff;
    const signedOff = await this.automationBlockService.reconcile(automationId, signOffable);
    const consented = new Set(run.trigger === 'runNow' ? run.consentedFindings : []);
    const answer = automationAnswer(findings, signedOff, consented);
    const proceeds = run.trigger === 'schedule' ? answer.schedule : answer.runNow;
    if (proceeds !== 'runs') {
      const awaiting = answer.blocks.awaitingSignOff.filter((f) => !consented.has(f.id));
      problems.push(...[...answer.blocks.needsFix, ...awaiting].map((f) => f.message));
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
    const plan = await this.planRun(
      draft.taskId,
      providerSettings,
      await this.loadQueries(draft.queries)
    );
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
    automationQueries: LoadedQuery[]
  ): Promise<RunPlan> {
    const contentType = automationQueries[0].record.contentType;
    const querySpecs = automationQueries.map(({ record, role }) => ({
      filters: record.filters,
      role,
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
      const mediaSource = counting(
        mediaSourceFor(provider as RadarrProvider | SonarrProvider, providerSettings.id)
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
        poolSize: mediaSource.count(),
        matchedCount: matched.length,
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
    let fetched: ReturnType<MediaSource['getMediaItems']> | undefined;
    const pooled = counting({
      // Fetched once, so what a run excludes is judged on the same catalog as what it includes.
      getMediaItems: () => {
        fetched ??= Promise.all(entries.map((e) => e.source.getMediaItems())).then((all) =>
          all.flat()
        );
        return fetched;
      },
      idOf: () => undefined,
    });
    const matched = await this.mediaQueryEngine.evaluate({
      source: pooled,
      contentType,
      clauses: querySpecs,
    });
    const resolved = await resolveActuatorTargets(this.db, providerSettings.type, matched);
    // Copies of one title share an actuator id, so an exclude on any copy protects the title.
    const excludes = querySpecs.filter((spec) => spec.role === 'exclude');
    const protectedIds = new Set<string>();
    if (excludes.length > 0) {
      const excluded = await this.mediaQueryEngine.evaluate({
        source: pooled,
        contentType,
        clauses: excludes.map((spec) => ({ ...spec, role: 'include' as const })),
      });
      const { actuatorIds } = await resolveActuatorTargets(
        this.db,
        providerSettings.type,
        excluded
      );
      for (const id of actuatorIds) protectedIds.add(id);
    }
    const actuatorIds = resolved.actuatorIds.filter((id) => !protectedIds.has(id));
    return {
      task,
      targets: {
        contentType,
        items: resolved.addressed.filter((item) => {
          const id = resolved.actuatorIdOf(item);
          return id !== undefined && !protectedIds.has(id);
        }),
      },
      actuatorIds,
      poolSize: pooled.count(),
      matchedCount: resolved.addressed.length,
    };
  }

  /**
   * Emits the namespaced `<scope>:changed` event when a run with a declared data
   * scope acted on at least one item. For an actuator task `itemCount` is the planned
   * target count, so a run that failed partway still counts: over-eviction is the safe
   * direction. The payload is empty — consumers evict the whole scope, so the event need
   * only signal *that* the scope changed.
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
      status: Exclude<AutomationRunStatus, 'running'>;
      error?: string;
      kind: 'user' | 'system';
      targets?: RunTargets;
    },
    runId?: number
  ): Promise<void> {
    // A skip describes the automation's validity, not an execution, so the
    // last-run summary keeps describing the last run that did execute.
    const [, run] = await Promise.all([
      result.status === 'skipped'
        ? undefined
        : this.automationService.recordRun(automationId, { ...result, status: result.status }),
      runId !== undefined
        ? this.automationRunService.finishRun(runId, result)
        : this.automationRunService.createRun({
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

// System data jobs write enrichment and identity data. They declare `affects: 'media'`
// for caches held over that data; none exists yet, and the planned enrichment cache will
// be the first. Today's media caches hold only upstream fetches, which these jobs don't
// change (`media.cache.enrichmentFresh.integration.test.ts` fails if that stops being so).
export const SYSTEM_TASKS: Record<string, { affects?: 'media' }> = {
  'system:enrichment': { affects: 'media' },
  'system:identity-resolution': { affects: 'media' },
};
