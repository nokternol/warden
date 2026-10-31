import type { AutomationRunStatus } from '@contract/schemas';

/** How each run outcome reads on its badge, wherever a run outcome is shown. */
export const RUN_STATUS: Record<
  AutomationRunStatus,
  { variant: 'success' | 'error' | 'warning'; label: string }
> = {
  success: { variant: 'success', label: 'Succeeded' },
  error: { variant: 'error', label: 'Failed' },
  skipped: { variant: 'warning', label: 'Invalid' },
};
