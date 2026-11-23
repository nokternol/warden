import type { ContentType } from '@contract/schemas';
import { isOfferedProviderType, isOfferedRule } from '@contract/scope';
import { api } from '@server/kernel/api';
import type { KernelCradle } from '@server/kernel/container';
import type { MediaCradle } from './media.registrations';
import { MEDIA_RULES, suppliersOf, toDescriptor } from './ruleRegistry';
import type { MediaRule, MediaRuleDescriptor } from './ruleRegistry';

// Widened for iteration: MEDIA_RULES's literal-narrowed export type (needed for the
// derived range-param-name types in ruleRegistry.ts) breaks `.includes()`'s overload
// resolution when iterated directly — a union of differently-typed readonly tuples has
// no single well-typed `includes` signature. The general `MediaRule` shape is all this
// handler needs.
const RULES: readonly MediaRule[] = MEDIA_RULES;

export function createRulesProcedures(
  cradle: Pick<MediaCradle, 'libraryCache'> & Pick<KernelCradle, 'scope'>
) {
  const { libraryCache, scope } = cradle;

  async function gatedDescriptors(contentType?: ContentType): Promise<MediaRuleDescriptor[]> {
    const activeTypes = new Set((await libraryCache.read()).providers.map((p) => p.type));
    // A live supplier of what the rule reads is active, and of a type that is offered.
    const hasLiveSupplier = (rule: MediaRule) =>
      suppliersOf(rule, contentType).some(
        (type) => activeTypes.has(type) && isOfferedProviderType(scope, type)
      );

    return RULES.filter(
      (rule) => contentType === undefined || rule.contentTypes.includes(contentType)
    )
      .filter((rule) => isOfferedRule(scope, rule.key))
      .filter(hasLiveSupplier)
      .flatMap((rule) => toDescriptor(rule) ?? []);
  }

  return {
    rules: api.media.rules.handler(async ({ input }) => gatedDescriptors(input.contentType)),
  };
}
