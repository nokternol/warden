import { automations } from '@contract/automations';
import { AutomationSchema, AutomationStatusSchema } from '@contract/schemas';
import { describe, expect, it } from 'vitest';

describe('automation status', () => {
  it('accepts active and disabled', () => {
    expect(AutomationStatusSchema.parse('active')).toBe('active');
    expect(AutomationStatusSchema.parse('disabled')).toBe('disabled');
  });

  it('rejects anything else, including the retired paused', () => {
    expect(AutomationStatusSchema.safeParse('paused').success).toBe(false);
    expect(AutomationStatusSchema.safeParse('archived').success).toBe(false);
  });

  it('is the status the automation read model carries', () => {
    expect(AutomationSchema.shape.status).toBe(AutomationStatusSchema);
  });

  it('is the status the updateStatus procedure accepts', () => {
    const input = automations.updateStatus['~orpc'].inputSchema;
    if (!input) throw new Error('updateStatus declares no input schema');
    expect(input.safeParse({ id: 1, status: 'paused' }).success).toBe(false);
    expect(input.safeParse({ id: 1, status: 'disabled' }).success).toBe(true);
  });
});
