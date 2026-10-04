import type { ContentType } from '@contract/schemas';
import { api } from '@server/kernel/api';
import type { ActiveFieldSetCache } from './activeFieldSet';
import { MEDIA_RULES, toDescriptor } from './ruleRegistry';
import type { MediaRule, MediaRuleDescriptor } from './ruleRegistry';

// Widened for iteration: MEDIA_RULES's literal-narrowed export type (needed for the
// derived range-param-name types in ruleRegistry.ts) breaks `.includes()`'s overload
// resolution when iterated directly — a union of differently-typed readonly tuples has
// no single well-typed `includes` signature. The general `MediaRule` shape is all this
// handler needs.
const RULES: readonly MediaRule[] = MEDIA_RULES;

interface RulesCradle {
  activeFieldSetCache: ActiveFieldSetCache;
}

export function createRulesProcedures(cradle: RulesCradle) {
  const { activeFieldSetCache } = cradle;

  async function gatedDescriptors(contentType?: ContentType): Promise<MediaRuleDescriptor[]> {
    const configuredTypes = await activeFieldSetCache.getActiveTypes();

    return RULES.filter(
      (rule) => contentType === undefined || rule.contentTypes.includes(contentType)
    )
      .filter((rule) => rule.sourceProviders.some((sp) => configuredTypes.has(sp)))
      .map(toDescriptor);
  }

  return {
    rules: api.media.rules.handler(async ({ input }) => gatedDescriptors(input.contentType)),
  };
}
