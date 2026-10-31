import type { Filter } from '@app/hooks/useMediaQueries';
import type { MediaProfile, MediaRuleDescriptor, MediaTag } from '@contract/media';
import { type RangeValue, isInstanceScopedValue, isRangeValue } from '@contract/schemas';

/** The named instance data a filter's ids are shown through. */
export interface FilterSummaryLookups {
  tags: MediaTag[];
  qualityProfiles: MediaProfile[];
  languageProfiles: MediaProfile[];
}

function formatRange({ min, max }: RangeValue): string {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  return min !== undefined ? `${min} or more` : `up to ${max}`;
}

function namesOf(
  rule: MediaRuleDescriptor | undefined,
  { ids, providerId }: { ids: number[]; providerId?: number },
  lookups: FilterSummaryLookups
): string {
  const entries =
    rule?.dataType === 'instance-ids'
      ? (lookups[rule.lookup] as {
          id: number;
          providerId: number;
          label?: string;
          name?: string;
        }[])
      : [];
  const names = ids.map((id) => {
    const entry = entries.find(
      (e) => e.id === id && (providerId === undefined || e.providerId === providerId)
    );
    return entry?.label ?? entry?.name;
  });
  return names.every(Boolean) ? names.join(', ') : `${ids.length} selected`;
}

function formatValue(
  rule: MediaRuleDescriptor | undefined,
  value: Filter['value'],
  lookups: FilterSummaryLookups
): string {
  if (typeof value === 'boolean') {
    const labels = rule?.dataType === 'boolean' ? rule.valueLabels : undefined;
    return labels ? labels[value ? 'true' : 'false'] : value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    if (isInstanceScopedValue(value)) return namesOf(rule, value, lookups);
    if (isRangeValue(value)) return formatRange(value);
  }
  if ((rule?.dataType === 'string' || rule?.dataType === 'number') && rule.options) {
    const option = rule.options.find((o) => o.value === String(value));
    if (option) return option.label;
  }
  if (rule?.dataType === 'csv-strings') return String(value).split(',').join(', ');
  return String(value);
}

/** Words for a rule no active provider currently describes, so no chip shows a raw key. */
function labelFromKey(key: string): string {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One readable chip per filter, worded from the served rule descriptors. */
export function summarizeFilters(
  filters: Filter[],
  rules: MediaRuleDescriptor[] = [],
  lookups: FilterSummaryLookups = { tags: [], qualityProfiles: [], languageProfiles: [] }
): string[] {
  return filters.map(({ ruleKey, value }) => {
    const rule = rules.find((r) => r.key === ruleKey);
    return `${rule?.label ?? labelFromKey(ruleKey)}: ${formatValue(rule, value, lookups)}`;
  });
}
