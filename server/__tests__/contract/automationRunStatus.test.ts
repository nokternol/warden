import {
  AutomationLastRunSchema,
  AutomationRunSchema,
  AutomationRunStatusSchema,
} from '@contract/schemas';
import { describe, expect, it } from 'vitest';

const run = {
  id: 1,
  automationId: 1,
  automationName: 'Nightly',
  ranAt: '2026-06-04T02:00:00.000Z',
  itemCount: null,
  error: 'Tags filter names Radarr instance 3, which is not an active provider',
  createdAt: '2026-06-04T02:00:00.000Z',
};

describe('automation run status', () => {
  it('carries success, error and skipped on a recorded run', () => {
    for (const status of ['success', 'error', 'skipped']) {
      expect(AutomationRunSchema.safeParse({ ...run, status }).success).toBe(true);
    }
    expect(AutomationRunSchema.safeParse({ ...run, status: 'invalid' }).success).toBe(false);
  });

  it('keeps the last-run summary to executed runs, so a skip never appears there', () => {
    const lastRun = { at: '2026-06-04T02:00:00.000Z', itemCount: 0 };
    expect(AutomationLastRunSchema.safeParse({ ...lastRun, status: 'skipped' }).success).toBe(
      false
    );
    expect(AutomationLastRunSchema.safeParse({ ...lastRun, status: 'error' }).success).toBe(true);
  });

  it('is declared once, as the status a recorded run carries', () => {
    expect(AutomationRunSchema.shape.status).toBe(AutomationRunStatusSchema);
    expect(AutomationRunStatusSchema.options).toEqual(['running', 'success', 'error', 'skipped']);
  });
});
