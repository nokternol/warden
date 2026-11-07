import { DomainEventBus } from '@server/kernel/eventBus';
import { describe, expect, it } from 'vitest';

describe('DomainEventBus', () => {
  it('delivers a published typed event to a subscriber', () => {
    const bus = new DomainEventBus();
    const received: Array<{ automationId: number }> = [];

    bus.on('run:started', (payload) => received.push(payload));
    bus.emit('run:started', {
      automationId: 7,
      kind: 'user',
      taskId: 'unmonitorMovie',
      startedAt: new Date(),
    });

    expect(received).toHaveLength(1);
    expect(received[0].automationId).toBe(7);
  });

  // Cache invalidation relies on this: a provider save clears the media caches before
  // it returns, so the next request can't read stale data. An HTTP round trip can't
  // tell a synchronous bus from a deferred one; this test can.
  it('runs every listener before emit returns', () => {
    const bus = new DomainEventBus();
    let cleared = false;
    bus.on('provider:changed', () => {
      cleared = true;
    });

    bus.emit('provider:changed', {});

    expect(cleared).toBe(true);
  });
});
