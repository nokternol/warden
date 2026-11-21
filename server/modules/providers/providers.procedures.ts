import { apiUrlOf } from '@contract/providerUrl';
import type { ProviderType, TaskOptionsRoute } from '@contract/providers';
import { isOfferedProviderType, isOfferedTask } from '@contract/scope';
import type { MetadataProviderType } from '@server/database/schema';
import { api } from '@server/kernel/api';
import type { KernelCradle } from '@server/kernel/container';
import { ValidationError } from '@server/kernel/errors';
import { getChildLogger } from '@server/kernel/logger';
import { probeConnection } from './connectionProbe';
import { PROVIDER_CATALOGUE, describeProviderTypes, providerTypeLabel } from './providerCatalogue';
import type { ProviderListsReader } from './providerListsReader';
import type { ProvidersCradle } from './providers.registrations';
import { type MediaActuator, isMediaActuator } from './roles';
import { readEnabledTaskIds } from './taskEnablement';

const log = getChildLogger('ProvidersProcedures');

/**
 * Compile-time witness that the contract's provider types are exactly
 * MetadataProviderType's values, so `type` from a request can be read as one.
 */
type ProviderTypesAgree = [ProviderType] extends [`${MetadataProviderType}`]
  ? [`${MetadataProviderType}`] extends [ProviderType]
    ? true
    : never
  : never;
const _providerTypesAgree: ProviderTypesAgree = true;

interface TaskOption {
  id: string;
  label: string;
}

/** Whether one of `actuator`'s tasks takes a value chosen from `route`'s list. */
function namesRoute(actuator: MediaActuator, route: TaskOptionsRoute): boolean {
  return actuator.tasks().some(({ parameter }) => {
    if (parameter?.type === 'select') return parameter.optionsRoute === route;
    if (parameter?.type === 'fields') return parameter.fields.some((f) => f.optionsRoute === route);
    return false;
  });
}

/**
 * A provider instance's choices for `route`, from the lists the catalog refresh stored. Collections
 * have no stored list, so the answer for them is empty.
 */
async function storedChoices(
  providerId: number,
  route: TaskOptionsRoute,
  lists: ProviderListsReader
): Promise<TaskOption[]> {
  const stored = await lists.listsOf(providerId);
  switch (route) {
    case 'quality-profiles':
      return (stored?.qualityProfiles ?? []).map((p) => ({ id: String(p.id), label: p.name }));
    case 'tags':
      return (stored?.tags ?? []).map((t) => ({ id: String(t.id), label: t.label }));
    case 'collections':
      return [];
  }
}

/**
 * The `providers` procedures of the API contract: configured-instance CRUD,
 * connection probing, and provider capabilities.
 *
 * `libraryCache` is media's library copy, which providers may not import: it is typed by the
 * stored lists task parameter choices are read from.
 */
export function createProvidersProcedures(
  cradle: Pick<ProvidersCradle, 'providerSettingsService' | 'providerFactory'> &
    Pick<KernelCradle, 'scope'> & { libraryCache: ProviderListsReader }
) {
  const { providerSettingsService, providerFactory, libraryCache, scope } = cradle;

  /** Refuses a provider type the scope declaration defers. */
  function assertOfferedType(type: ProviderType): void {
    if (!isOfferedProviderType(scope, type)) {
      throw new ValidationError(`Provider type ${type} is not offered`);
    }
  }

  /** Refuses settings that enable a task the scope declaration defers for this provider's type. */
  async function assertEnablesOnlyOfferedTasks(
    providerId: number,
    settings: Record<string, unknown>
  ): Promise<void> {
    const { type } = await providerSettingsService.findById(providerId);
    const deferred = readEnabledTaskIds(settings).filter(
      (taskId) => !isOfferedTask(scope, type, taskId)
    );
    if (deferred.length > 0) {
      throw new ValidationError(`Task ${deferred.join(', ')} is not offered for ${type}`);
    }
  }

  return {
    // ─── Catalogue ─────────────────────────────────────────────────────────
    types: api.providers.types.handler(async () =>
      describeProviderTypes().filter((entry) => isOfferedProviderType(scope, entry.type))
    ),

    // ─── Configured instances ──────────────────────────────────────────────
    list: api.providers.list.handler(async () => providerSettingsService.list()),

    create: api.providers.create.handler(async ({ input }) => {
      assertOfferedType(input.type);
      return providerSettingsService.create({ ...input, type: input.type as MetadataProviderType });
    }),

    update: api.providers.update.handler(async ({ input }) => {
      const { id, ...patch } = input;
      if (patch.settings) await assertEnablesOnlyOfferedTasks(id, patch.settings);
      return providerSettingsService.update(id, patch);
    }),

    delete: api.providers.delete.handler(async ({ input }) => {
      await providerSettingsService.delete(input.id);
      return null;
    }),

    test: api.providers.test.handler(async ({ input }) => {
      assertOfferedType(input.type);
      const type = input.type as MetadataProviderType;
      const stored =
        input.id === undefined ? undefined : await providerSettingsService.findById(input.id);
      if (stored !== undefined && stored.type !== type) {
        const [saved, asked] = [providerTypeLabel(stored.type), providerTypeLabel(type)];
        throw new ValidationError(`Provider ${stored.id} is ${saved}, not ${asked}`);
      }
      // Only a test of what is saved describes the provider; a test of an address or key being
      // edited says nothing about the saved one, so it is not kept. Callers send the host as the
      // owner entered it, and a saved URL carries its type's API path, so the host is compared
      // once the API path is added.
      const testsSaved =
        stored !== undefined &&
        input.apiKey === undefined &&
        apiUrlOf(input.url, PROVIDER_CATALOGUE[stored.type].apiPath) === stored.url;
      let result: { ok: true } | { ok: false; error: string };
      try {
        await probeConnection(
          providerFactory,
          { type, url: input.url, apiKey: input.apiKey },
          stored
        );
        result = { ok: true };
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (testsSaved) await providerSettingsService.recordTest(stored.id, result);
      return result;
    }),

    // ─── Capabilities ──────────────────────────────────────────────────────
    tasks: api.providers.tasks.handler(async () => {
      const providers = await providerSettingsService.list();

      return providers.flatMap((p) => {
        const instance = providerFactory.create(p, log);
        if (!isMediaActuator(instance)) return [];

        const enabled = readEnabledTaskIds(p.settings);
        return [
          {
            providerId: p.id,
            type: p.type,
            tasks: instance
              .tasks()
              .filter((task) => isOfferedTask(scope, p.type, task.id))
              .map(({ run: _run, ...descriptor }) => ({
                ...descriptor,
                enabled: enabled.includes(descriptor.id),
              })),
          },
        ];
      });
    }),

    taskOptions: api.providers.taskOptions.handler(async ({ input: params }) => {
      const providers = await providerSettingsService.list();

      const entries = await Promise.all(
        providers.map(async (p) => {
          // A provider offers choices for a route exactly when one of its tasks names it.
          const instance = providerFactory.create(p, log);
          if (!isMediaActuator(instance) || !namesRoute(instance, params.route)) return undefined;
          try {
            const options = await storedChoices(p.id, params.route, libraryCache);
            return { providerId: p.id, type: p.type, options };
          } catch (err) {
            log.warn('Task options fetch failed', { provider: p.name, route: params.route, err });
            return undefined;
          }
        })
      );

      return entries.filter((e): e is NonNullable<typeof e> => e !== undefined);
    }),
  };
}
