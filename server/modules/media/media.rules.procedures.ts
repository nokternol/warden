import type { ContentType } from '@contract/schemas';
import { isOfferedProviderType, isOfferedRule } from '@contract/scope';
import { api } from '@server/kernel/api';
import type { KernelCradle } from '@server/kernel/container';
import type { MediaCradle } from './media.registrations';
import { MEDIA_RULES, toDescriptor } from './ruleRegistry';
import type { MediaRule, MediaRuleDescriptor } from './ruleRegistry';

// Widened for iteration: MEDIA_RULES's literal-narrowed export type (needed for the
// derived range-param-name types in ruleRegistry.ts) breaks `.includes()`'s overload
// resolution when iterated directly — a union of differently-typed readonly tuples has
// no single well-typed `includes` signature. The general `MediaRule` shape is all this
// handler needs.
const RULES: readonly MediaRule[] = MEDIA_RULES;

export function createRulesProcedures(
  cradle: Pick<MediaCradle, 'activeFieldSetCache'> & Pick<KernelCradle, 'scope'>
) {
  const { activeFieldSetCache, scope } = cradle;

  async function gatedDescriptors(contentType?: ContentType): Promise<MediaRuleDescriptor[]> {
    const configuredTypes = await activeFieldSetCache.getActiveTypes();
    // A live producer is configured and active, and of a type that is offered.
    const hasLiveProducer = (rule: MediaRule) =>
      rule.providers.some(
        (type) => configuredTypes.has(type) && isOfferedProviderType(scope, type)
      );

    return RULES.filter(
      (rule) => contentType === undefined || rule.contentTypes.includes(contentType)
    )
      .filter((rule) => isOfferedRule(scope, rule.key))
      .filter(hasLiveProducer)
      .flatMap((rule) => toDescriptor(rule) ?? []);
  }

  return {
    rules: api.media.rules.handler(async ({ input }) => gatedDescriptors(input.contentType)),
  };
}
