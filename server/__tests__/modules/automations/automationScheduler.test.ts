/**
 * AutomationScheduler unit tests.
 *
 * Run: vitest run --project server
 */
import { AutomationScheduler } from '@server/modules/automations/automationScheduler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AutomationScheduler', () => {
  describe('construction', () => {
    it('throws at construction time when automationExecutor is missing', () => {
      expect(
        () => new AutomationScheduler({} as ConstructorParameters<typeof AutomationScheduler>[0])
      ).toThrow(/executor/i);
    });

    it('throws when automationExecutor is explicitly undefined', () => {
      expect(
        () =>
          new AutomationScheduler({
            automationExecutor: undefined,
          } as unknown as ConstructorParameters<typeof AutomationScheduler>[0])
      ).toThrow(/executor/i);
    });

    it('constructs successfully with a valid executor', () => {
      const executor = { execute: vi.fn().mockResolvedValue(undefined) };
      expect(() => new AutomationScheduler({ automationExecutor: executor })).not.toThrow();
    });
  });

  describe('tick behaviour', () => {
    let scheduler: AutomationScheduler;
    const mockExecutor = { execute: vi.fn<(id: number) => Promise<void>>() };

    beforeEach(() => {
      mockExecutor.execute.mockResolvedValue(undefined);
      scheduler = new AutomationScheduler({ automationExecutor: mockExecutor });
    });

    afterEach(() => {
      scheduler.stopAll();
      vi.clearAllMocks();
    });

    it('calls executor.execute with the automation id on each tick', async () => {
      scheduler.schedule({ id: 7, name: 'Nightly', schedule: '* * * * *' });
      await scheduler.trigger(7);
      expect(mockExecutor.execute).toHaveBeenCalledWith(7);
    });

    it('does not call executor.execute for unregistered ids', async () => {
      scheduler.schedule({ id: 7, name: 'Nightly', schedule: '* * * * *' });
      await scheduler.trigger(999);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('does not call executor.execute after the job is unscheduled', async () => {
      scheduler.schedule({ id: 7, name: 'Nightly', schedule: '* * * * *' });
      scheduler.unschedule(7);
      await scheduler.trigger(7);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });
  describe('wall-clock time zone', () => {
    let scheduler: AutomationScheduler | undefined;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      scheduler?.stopAll();
      scheduler = undefined;
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('fires a 09:00 schedule at 09:00 in the TZ environment zone, not at 09:00 UTC', async () => {
      vi.stubEnv('TZ', 'Asia/Tokyo'); // UTC+9, no daylight saving
      // 23:59 UTC is 08:59 in Tokyo, so the next 09:00 Tokyo is one minute away.
      vi.setSystemTime(new Date('2026-03-10T23:59:00Z'));
      const executor = { execute: vi.fn<(id: number) => Promise<void>>().mockResolvedValue() };
      scheduler = new AutomationScheduler({ automationExecutor: executor });

      scheduler.schedule({ id: 1, name: 'Nine', schedule: '0 9 * * *' });
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

      expect(executor.execute).toHaveBeenCalledTimes(1);
    });
  });
});
