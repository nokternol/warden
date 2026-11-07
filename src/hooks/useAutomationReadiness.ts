import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { AutomationReadiness } from '@contract/automations';

export type { AutomationReadiness };

/** What a Run Now of the automation would do and why; a `null` id fetches nothing. */
export function useAutomationReadiness(id: number | null) {
  return useApi(api.automations.readiness, id === null ? null : { id });
}
