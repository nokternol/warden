import type { AutomationPreview, AutomationReadiness } from '@contract/automations';
import { type RefreshRecord, freshnessOf } from '@contract/media';
import type { ReadinessFinding } from '@contract/readiness';
import type { AutomationRunStatus, ContentType } from '@contract/schemas';
import type { MetadataProvider, MetadataProviderType } from '../../database/schema';
import type { DrizzleDb } from '../../kernel/db';
import { ValidationError } from '../../kernel/errors';
import type { DomainEventBus } from '../../kernel/eventBus';
import { getChildLogger } from '../../kernel/logger';
import {
  ADDRESS_COLUMN_BY_TYPE,
  MEDIA_SERVER_BY_COLUMN,
  MediaQueryEngine,
  actuatorIdOf,
  automationAnswer,
  copiesSource,
  findingsFor,
  getRule,
  isAddressedActuator,
  itemKey,
} from '../media';
import type {
  FilterReadiness,
  Library,
  LibraryCache,
  LibraryCopy,
  MediaQueryClause,
} from '../media';
import type { MediaQueryRecord, MediaQueryService } from '../mediaQueries';
import {
  type ActuatorTask,
  type IProviderFactory,
  ProviderFactory,
  type ProviderSettingsService,
  SOURCE_OWNER,
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
  /** The library copy every plan reads. */
  libraryCache: Pick<LibraryCache, 'contentOf'>;
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
  /** Each refresh a destructive run depends on that failed or never ran, as a reason not to act. */
  unrefreshed: string[];
  /** The refresh records of the copy the plan was made from. */
  records: RefreshRecord[];
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
  return `Not run: this would act on ${matchedCount} of ${poolSize} copies, more than half the library. Narrow its queries if that is intended.`;
}

/** Why a planned run will not act, one line per reason; empty when it will. */
function whyPlanWontRun(plan: Pick<RunPlan, 'task' | 'matchedCount' | 'poolSize' | 'unrefreshed'>) {
  return [...plan.unrefreshed, excessiveReach(plan)].filter((r): r is string => r !== undefined);
}

/** A provider's data of one kind that a destructive run depends on. */
interface Dependency {
  providerId: number;
  kind: 'catalog' | 'links' | 'facts';
}

/**
 * A fact a destructive run's queries filter on, and the active providers that supply it. A
 * supplier reached through a media server's links (Tautulli and Plex through Plex, Jellyfin through
 * Jellyfin) lists that server's instances in `via`.
 */
interface FactDependency {
  label: string;
  suppliers: Array<{ providerId: number; via: number[] }>;
}

/** What a destructive run depends on: providers it needs every one of, and facts it needs once. */
interface Dependencies {
  required: Dependency[];
  facts: FactDependency[];
}

const KIND_NOUN: Record<Dependency['kind'], string> = {
  catalog: 'catalog',
  links: 'links',
  facts: 'facts',
};

/** Why one provider's data of one kind cannot be relied on; undefined when it can. */
function unrefreshed(library: Library, { providerId, kind }: Dependency): string | undefined {
  const name = library.providers.find((p) => p.id === providerId)?.name ?? `Provider ${providerId}`;
  const record = library.records.find((r) => r.providerId === providerId && r.kind === kind);
  if (record?.failedAt != null) {
    return `${name}'s ${KIND_NOUN[kind]} refresh failed (${record.error ?? 'no answer'})`;
  }
  if (record?.refreshedAt == null) return `${name}'s ${KIND_NOUN[kind]} has not refreshed yet`;
  return undefined;
}

/**
 * Why a destructive run must not act on the copy (north-star belief 7), one line per reason; empty
 * for a non-destructive task. A provider the run needs that failed its latest refresh, or was never
 * read, stops it. A fact its queries filter on stops it only when none of the fact's active
 * suppliers has a good refresh: a fact another connected service still supplies does not depend on
 * the one that failed.
 */
function unrefreshedDependencies(
  library: Library,
  task: Pick<ActuatorTask, 'destructive'>,
  { required, facts }: Dependencies
): string[] {
  if (!task.destructive) return [];
  const seen = new Set<string>();
  const missing = required.flatMap((dependency) => {
    const key = `${dependency.providerId}:${dependency.kind}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const reason = unrefreshed(library, dependency);
    return reason ? [`Not run: ${reason}`] : [];
  });
  const unsupplied = facts.flatMap(({ label, suppliers }) => {
    if (suppliers.length === 0) return [];
    const reasons = suppliers.map(({ providerId, via }) => {
      const facts = unrefreshed(library, { providerId, kind: 'facts' });
      if (facts) return facts;
      const links = via.map((id) => unrefreshed(library, { providerId: id, kind: 'links' }));
      return via.length > 0 && links.every((r) => r !== undefined) ? links[0] : undefined;
    });
    if (reasons.some((r) => r === undefined)) return [];
    return [`Not run: no provider supplying ${label} has refreshed (${reasons.join('; ')})`];
  });
  return [...missing, ...unsupplied];
}

/** The content type an automation's queries select; every query of one automation shares it. */
function contentTypeOf(queries: LoadedQuery[]): ContentType {
  return queries[0]?.record.contentType ?? 'movie';
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
  private readonly libraryCache: Pick<LibraryCache, 'contentOf'>;
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
    this.mediaQueryEngine = deps.mediaQueryEngine ?? new MediaQueryEngine();
    this.filterReadiness = deps.filterReadiness;
    this.automationBlockService = deps.automationBlockService;
    this.libraryCache = deps.libraryCache;
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
        try {
          itemCount = await this.systemTaskRunner.run(automation.taskId);
        } finally {
          // A refresh job rewrites the library copy whether it succeeds or fails partway.
          this.eventBus?.emit('media:changed', {});
        }
        await this.recordResult(automationId, taskId, { itemCount, status: 'success', kind });

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
            const contentType = contentTypeOf(queries);
            const { records } = await this.libraryCache.contentOf(contentType);
            await this.recordSkip(automationId, taskId, reason, {
              contentType,
              mediaItemIds: [],
              freshness: freshnessOf(records),
            });
          }
          return;
        }
        const plan = await this.planRun(current.taskId, providerSettings, queries);
        targets = plan.targets;
        itemCount = targets.mediaItemIds.length;
        const notRun = whyPlanWontRun(plan);
        if (notRun.length > 0) {
          await this.recordSkip(automationId, taskId, notRun.join('; '), {
            ...targets,
            mediaItemIds: [],
          });
          return;
        }
        const run = await this.automationRunService.beginRun({ automationId, kind, targets });
        runId = run.id;
        await plan.task.run(plan.actuatorIds, current.taskParameter);
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

  /**
   * Records that a user automation was not run, and why, with how current the library copy it was
   * judged on was. `targets` names no copies: a skipped run acted on none.
   */
  private async recordSkip(
    automationId: number,
    taskId: string,
    reason: string,
    targets: RunTargets
  ): Promise<void> {
    log.warn('Automation skipped as invalid', { automationId, reason });
    await this.recordResult(automationId, taskId, {
      itemCount: 0,
      status: 'skipped',
      error: reason,
      kind: 'user',
      targets,
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
   */
  private async blockingProblems(
    automationId: number,
    automationProvider: MetadataProvider,
    automationQueries: LoadedQuery[],
    started: RunTrigger
  ): Promise<string[]> {
    const { findings, signedOff, problems } = await this.judge(
      automationId,
      automationProvider,
      automationQueries
    );
    const consented = new Set(started.trigger === 'runNow' ? started.consentedFindings : []);
    const answer = automationAnswer(findings, signedOff, consented);
    const verdict = started.trigger === 'schedule' ? answer.schedule : answer.runNow;
    if (problems.length === 0 && verdict === 'runs') return [];
    const awaiting = answer.blocks.awaitingSignOff.filter((f) => !consented.has(f.id));
    return [...problems, ...[...answer.blocks.needsFix, ...awaiting].map((f) => f.message)];
  }

  /**
   * The automation's own problems, its filter findings and which are signed off. Keeps its stored
   * blocks in step with the findings on the way.
   */
  private async judge(
    automationId: number,
    automationProvider: MetadataProvider,
    automationQueries: LoadedQuery[]
  ): Promise<{ findings: ReadinessFinding[]; signedOff: Set<string>; problems: string[] }> {
    const problems: string[] = [];
    if (!automationProvider.isActive) {
      problems.push(
        `${instanceName(automationProvider.type, automationProvider.id)}, this automation's provider, is not an active provider`
      );
    }
    const facts = await this.filterReadiness.readFacts();
    const findings = automationQueries.flatMap(({ queryId, role, record }) =>
      findingsFor(
        facts,
        { queryId, role, contentType: record.contentType, filters: record.filters },
        { id: automationProvider.id, type: automationProvider.type }
      )
    );
    // Before any sign-off is known, every finding a user could accept awaits sign-off.
    const signOffable = automationAnswer(findings, new Set()).blocks.awaitingSignOff;
    const signedOff = await this.automationBlockService.reconcile(automationId, signOffable);
    return { findings, signedOff, problems };
  }

  /**
   * What a Run Now of this automation would do, and why, before anything runs. The findings are
   * answered even when counting the targets fails. The count comes from the library copy as the
   * cache holds it, the same copy a run acts on.
   */
  async readiness(automationId: number): Promise<AutomationReadiness> {
    const automation = await this.automationService.getById(automationId);
    if (!automation.provider) {
      throw new Error(`Automation ${automationId} has no provider`);
    }
    const providerSettings = await this.providerSettingsService.findById(automation.provider.id);
    const queries = await this.loadQueries(automation.queries ?? []);
    const { findings, signedOff, problems } = await this.judge(
      automationId,
      providerSettings,
      queries
    );
    const answer = automationAnswer(findings, signedOff);
    const counted = await this.planRun(automation.taskId, providerSettings, queries).then(
      (plan) => {
        // A run skipped after planning says so here, so Run Now does not confirm a run that won't act.
        problems.push(...whyPlanWontRun(plan));
        return { count: plan.actuatorIds.length, records: plan.records };
      },
      async (err: unknown) => ({
        count: null,
        countError: err instanceof Error ? err.message : 'Unknown error',
        records: (await this.libraryCache.contentOf(contentTypeOf(queries))).records,
      })
    );
    return {
      schedule: problems.length > 0 ? 'blocked' : answer.schedule,
      runNow: problems.length > 0 ? 'stops' : answer.runNow,
      blocks: answer.blocks,
      problems,
      contentType: contentTypeOf(queries),
      ...counted,
    };
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
    return {
      count: plan.actuatorIds.length,
      contentType: plan.targets.contentType,
      records: plan.records,
    };
  }

  /**
   * Decides what a user run acts on, from the library copy: the enabled task, the copies the
   * queries target, and those copies in the actuator's own id space. Running the task is the
   * caller's step, so the targets are known even if the task fails.
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

    const { library, copies, records } = await this.libraryCache.contentOf(contentType);
    const unrefreshed = unrefreshedDependencies(
      library,
      task,
      this.dependencies(library, providerSettings, contentType, automationQueries)
    );

    const included = (candidates: LibraryCopy[]) =>
      this.matching(
        candidates,
        contentType,
        querySpecs.filter((spec) => spec.role === 'include')
      );
    // An exclude protects the whole title, judged over every active instance's copies.
    const protectedTitles = await this.protectedTitles(copies, contentType, querySpecs);
    const freshness = freshnessOf(records);
    const planOf = (
      targets: LibraryCopy[],
      actuatorIds: RunPlan['actuatorIds'],
      poolSize: number,
      matchedCount: number
    ): RunPlan => ({
      task,
      targets: { contentType, mediaItemIds: targets.map((c) => c.mediaItemId), freshness },
      actuatorIds,
      poolSize,
      matchedCount,
      unrefreshed,
      records,
    });
    const unprotected = (candidates: LibraryCopy[]) =>
      candidates.filter((copy) => !protectedTitles.has(copy.mediaIdentityId));

    if (isMediaSourceType(providerSettings.type)) {
      // Catalog-owning actuator: the included queries evaluate against its own copies and their
      // native ids feed the task directly, one target per native id.
      const own = copies.filter((copy) => copy.providerId === providerSettings.id);
      const matched = await included(own);
      const targets = unprotected(matched);
      return planOf(
        targets,
        targets.map((c) => c.record.id),
        own.length,
        targets.length
      );
    }

    // Non-source actuator: it owns no catalog, so the included queries evaluate against every
    // active source instance's copies, and matched copies reach the actuator by the media-server
    // id the catalog refresh linked to their title. A title not linked drops out: the task never
    // receives an id it cannot address.
    if (!isAddressedActuator(providerSettings.type)) {
      throw new Error(`Provider type "${providerSettings.type}" has no actuator addressing space`);
    }
    const addressed = (await included(copies)).filter(
      (copy) => actuatorIdOf(copy, providerSettings.type) !== undefined
    );
    const targets = unprotected(addressed);
    return planOf(
      targets,
      [...new Set(targets.map((c) => actuatorIdOf(c, providerSettings.type)!))],
      copies.length,
      addressed.length
    );
  }

  /**
   * The refreshes a run on `providerSettings` reads. It needs every one of: the catalog of each
   * instance whose copies it evaluates (a source run: its own, plus every other active instance of
   * the content type when it has excluded queries; any other run: every active instance) and the
   * links of the media server whose ids it addresses. For each rule its queries use it needs one
   * active supplier with refreshed facts (and, for a supplier reached through a media server's
   * links, refreshed links).
   */
  private dependencies(
    library: Library,
    providerSettings: MetadataProvider,
    contentType: ContentType,
    queries: LoadedQuery[]
  ): Dependencies {
    const active = (type: MetadataProviderType) =>
      library.providers.filter((p) => p.type === type).map((p) => p.id);
    const linkProviders = (type: MetadataProviderType): number[] => {
      const column = ADDRESS_COLUMN_BY_TYPE[type];
      return column ? active(MEDIA_SERVER_BY_COLUMN[column]) : [];
    };
    const sourceType = SOURCE_OWNER[contentType];
    const isSource = isMediaSourceType(providerSettings.type);
    const evaluatesEveryInstance = !isSource || queries.some((q) => q.role === 'exclude');
    const catalogs = (evaluatesEveryInstance ? active(sourceType) : [providerSettings.id]).map(
      (providerId) => ({ providerId, kind: 'catalog' as const })
    );
    const addressed = isSource
      ? []
      : linkProviders(providerSettings.type).map((providerId) => ({
          providerId,
          kind: 'links' as const,
        }));
    const rules = new Map(
      queries.flatMap(({ record }) =>
        record.filters.flatMap(({ ruleKey }) => {
          const rule = getRule(ruleKey, contentType);
          return rule ? [[rule.key, rule] as const] : [];
        })
      )
    );
    const facts = [...rules.values()].map((rule) => ({
      label: rule.label,
      suppliers: rule.providers
        .filter((type) => !isMediaSourceType(type))
        .flatMap((type) =>
          active(type).map((providerId) => ({ providerId, via: linkProviders(type) }))
        ),
    }));
    return { required: [...catalogs, ...addressed], facts };
  }

  /** The copies among `copies` that `clauses` select, by the one query evaluation. */
  private async matching(
    copies: LibraryCopy[],
    contentType: ContentType,
    clauses: MediaQueryClause[]
  ): Promise<LibraryCopy[]> {
    if (clauses.length === 0) return [];
    const matched = new Set(
      (
        await this.mediaQueryEngine.evaluate({
          source: copiesSource(copies),
          contentType,
          clauses,
        })
      ).map((item) => itemKey(item))
    );
    return copies.filter((copy) => matched.has(itemKey(copy.item)));
  }

  /** The titles a run's excludes protect: every title the excluded queries select. */
  private async protectedTitles(
    copies: LibraryCopy[],
    contentType: ContentType,
    querySpecs: MediaQueryClause[]
  ): Promise<Set<number>> {
    const excludes = querySpecs.filter((spec) => spec.role === 'exclude').map((s) => s.filters);
    const excluded = this.mediaQueryEngine.select(copies, {
      contentType,
      include: excludes,
      exclude: [],
    });
    return new Set(excluded.map((title) => title.mediaIdentityId));
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
