import type { AutomationPreview } from '@app/hooks/useAutomationPreview';

const ITEM_NOUNS: Record<AutomationPreview['contentType'], { one: string; many: string }> = {
  movie: { one: 'movie', many: 'movies' },
  series: { one: 'series', many: 'series' },
};

/** What is known about how many items a destructive task will affect. */
export type BlastRadius =
  | { state: 'counted'; phrase: string }
  | { state: 'counting'; phrase: string }
  | { state: 'failed'; phrase: string };

/** A destructive action can be confirmed only in the `counted` state. */
export function blastRadius({
  data,
  error,
}: { data?: AutomationPreview; error?: Error }): BlastRadius {
  if (data) {
    const nouns = ITEM_NOUNS[data.contentType];
    const noun = data.count === 1 ? nouns.one : nouns.many;
    return {
      state: 'counted',
      phrase: `will affect ${data.count.toLocaleString()} ${noun}`,
    };
  }
  return error
    ? { state: 'failed', phrase: "Couldn't count the affected items." }
    : { state: 'counting', phrase: 'Counting affected items…' };
}
