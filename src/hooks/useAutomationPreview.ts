import { api } from '@app/lib/api/client';
import { useApi } from '@app/lib/api/useApi';
import type { AutomationPreview, AutomationPreviewInput } from '@contract/automations';

export type { AutomationPreview, AutomationPreviewInput };

/** How many items an unsaved automation would act on now; a `null` draft fetches nothing. */
export function useAutomationPreview(draft: AutomationPreviewInput | null) {
  return useApi(api.automations.preview, draft);
}
