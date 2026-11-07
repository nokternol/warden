import {
  type MetadataProvider,
  type MetadataProviderType,
  type NewMetadataProvider,
  type RawMetadataProvider,
  metadataProviders,
} from '@server/database/schema';
import type { DrizzleDb } from '@server/kernel/db';
import { NotFoundError, ValidationError } from '@server/kernel/errors';
import type { DomainEventBus } from '@server/kernel/eventBus';
import { getChildLogger } from '@server/kernel/logger';
import { and, eq, inArray } from 'drizzle-orm';
import { isMediaSourceType } from './roles';

const log = getChildLogger('ProviderSettingsService');

export interface ProviderSettingsDraft {
  type: MetadataProviderType;
  name: string;
  url: string;
  apiKey?: string;
  settings?: Record<string, unknown>;
  isActive?: boolean;
}

export interface ProviderSummary {
  id: number;
  type: MetadataProviderType;
  name: string;
  url: string;
  /** Always '***' when an apiKey was saved; null when no apiKey was provided. */
  apiKey: '***' | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  /** The last connection test of the saved address and key; null until one has run. */
  lastTest: ProviderLastTest | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderLastTest {
  ok: boolean;
  at: Date;
  /** Why the test failed; null when it passed. */
  error: string | null;
}

function parseRaw(raw: RawMetadataProvider): MetadataProvider {
  return {
    id: raw.id,
    type: raw.type as MetadataProviderType,
    name: raw.name,
    url: raw.url,
    apiKey: raw.apiKey ?? null,
    settings: raw.settings ? (JSON.parse(raw.settings) as Record<string, unknown>) : null,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function summarize(raw: RawMetadataProvider): ProviderSummary {
  const provider = parseRaw(raw);
  return {
    ...provider,
    apiKey: provider.apiKey !== null ? '***' : null,
    lastTest:
      raw.lastTestOk === null || raw.lastTestAt === null
        ? null
        : { ok: raw.lastTestOk, at: new Date(raw.lastTestAt * 1000), error: raw.lastTestError },
  };
}

/**
 * The fail-fast hook `assertNoActiveConflict`'s call site invokes with the
 * prospective active-type set (current active types plus the type being
 * activated). Media-ignorant on purpose — `providers` never imports from
 * `media`; the real precedence-coverage check is wired in by `media`'s DI
 * registration, this class only knows it's a callback that may throw.
 */
export type PrecedenceCoverageValidator = (activeTypes: Set<MetadataProviderType>) => void;

/**
 * Stored provider configuration. Every mutation that can change which providers are
 * active or what they serve sends `provider:changed`, which clears the caches built from
 * provider data; a new such mutation sends it too.
 */
export class ProviderSettingsService {
  private readonly db: DrizzleDb;
  private readonly eventBus?: DomainEventBus;
  private readonly precedenceCoverageValidator?: PrecedenceCoverageValidator;

  constructor({
    db,
    eventBus,
    precedenceCoverageValidator,
  }: {
    db: DrizzleDb;
    eventBus?: DomainEventBus;
    precedenceCoverageValidator?: PrecedenceCoverageValidator;
  }) {
    this.db = db;
    this.eventBus = eventBus;
    this.precedenceCoverageValidator = precedenceCoverageValidator;
  }

  async list(): Promise<ProviderSummary[]> {
    const rows = await this.db.select().from(metadataProviders);
    return rows.map((r) => summarize(r));
  }

  /** The set of provider types with an active configured instance. */
  async activeTypes(): Promise<Set<MetadataProviderType>> {
    const providers = await this.list();
    return new Set(providers.filter((p) => p.isActive).map((p) => p.type));
  }

  /**
   * Enforces the single-active-provider-per-type invariant (D8), role-scoped: types
   * playing the `MediaSource` role (Radarr, Sonarr — see `isMediaSourceType`) may have
   * any number of active instances; every other type still rejects when an active
   * provider of `type` already exists. `excludeId` omits the row being updated so
   * re-saving an already-active provider is not treated as a conflict.
   */
  private async assertNoActiveConflict(
    type: MetadataProviderType,
    excludeId?: number
  ): Promise<void> {
    if (isMediaSourceType(type)) return;
    const active = await this.findActiveByTypes([type]);
    if (active.some((p) => p.id !== excludeId)) {
      throw new ValidationError(`An active ${type} provider already exists; deactivate it first`);
    }
  }

  /**
   * Runs the injected `precedenceCoverageValidator` (if any) against the
   * prospective active-type set — current active types plus `type`, the one
   * being activated. Fails loudly here, at provider-activation time, if
   * activating `type` would leave a contested field's precedence order
   * missing an active producer.
   */
  private async assertPrecedenceCovered(type: MetadataProviderType): Promise<void> {
    if (!this.precedenceCoverageValidator) return;
    const prospective = await this.activeTypes();
    prospective.add(type);
    this.precedenceCoverageValidator(prospective);
  }

  /** Both provider-activation-time guardrails, run together at create/update's hook point. */
  private async assertActivationIsValid(
    type: MetadataProviderType,
    excludeId?: number
  ): Promise<void> {
    await this.assertNoActiveConflict(type, excludeId);
    await this.assertPrecedenceCovered(type);
  }

  async create(draft: ProviderSettingsDraft): Promise<ProviderSummary> {
    if (draft.isActive ?? true) {
      await this.assertActivationIsValid(draft.type);
    }

    const insert: NewMetadataProvider = {
      type: draft.type,
      name: draft.name,
      url: draft.url,
      apiKey: draft.apiKey ?? null,
      settings: draft.settings ? JSON.stringify(draft.settings) : null,
      isActive: draft.isActive ?? true,
    };

    const [raw] = await this.db.insert(metadataProviders).values(insert).returning();
    this.eventBus?.emit('provider:changed', {});
    log.debug('Provider created', { id: raw.id, type: raw.type });
    return summarize(raw);
  }

  async update(id: number, patch: Partial<ProviderSettingsDraft>): Promise<ProviderSummary> {
    if (patch.isActive === true) {
      const current = await this.findById(id);
      await this.assertActivationIsValid(current.type, id);
    }

    const updateValues: Partial<NewMetadataProvider> = {};

    if (patch.name !== undefined) updateValues.name = patch.name;
    if (patch.url !== undefined) updateValues.url = patch.url;
    if (patch.apiKey !== undefined) updateValues.apiKey = patch.apiKey;
    if (patch.url !== undefined || patch.apiKey !== undefined) {
      updateValues.lastTestOk = null;
      updateValues.lastTestAt = null;
      updateValues.lastTestError = null;
    }
    if (patch.settings !== undefined)
      updateValues.settings = patch.settings ? JSON.stringify(patch.settings) : null;
    if (patch.isActive !== undefined) updateValues.isActive = patch.isActive;

    const [raw] = await this.db
      .update(metadataProviders)
      .set(updateValues)
      .where(eq(metadataProviders.id, id))
      .returning();

    if (!raw) {
      throw new NotFoundError(`Provider with id ${id} not found`);
    }

    this.eventBus?.emit('provider:changed', {});
    log.debug('Provider updated', { id });
    return summarize(raw);
  }

  /** Records the outcome of a connection test of the provider's saved address and key. */
  async recordTest(id: number, result: { ok: boolean; error?: string }): Promise<void> {
    await this.db
      .update(metadataProviders)
      .set({
        lastTestOk: result.ok,
        lastTestAt: Math.floor(Date.now() / 1000),
        lastTestError: result.ok ? null : (result.error ?? null),
      })
      .where(eq(metadataProviders.id, id));
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(metadataProviders).where(eq(metadataProviders.id, id));
    this.eventBus?.emit('provider:changed', {});
    log.debug('Provider deleted', { id });
  }

  async findById(id: number): Promise<MetadataProvider> {
    const [raw] = await this.db
      .select()
      .from(metadataProviders)
      .where(eq(metadataProviders.id, id));
    if (!raw) throw new NotFoundError(`Provider with id ${id} not found`);
    return parseRaw(raw);
  }

  async findActiveByTypes(types: MetadataProviderType[]): Promise<MetadataProvider[]> {
    if (types.length === 0) return [];

    const rows = await this.db
      .select()
      .from(metadataProviders)
      .where(and(eq(metadataProviders.isActive, true), inArray(metadataProviders.type, types)));

    return rows.map(parseRaw);
  }
}
