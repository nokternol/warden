import { EventEmitter } from 'node:events';
import type { AutomationRunStatus } from '@contract/schemas';

export interface DomainEvents {
  'run:started': {
    automationId: number;
    kind: 'user' | 'system';
    taskId: string;
    startedAt: Date;
  };
  'run:completed': {
    automationId: number;
    kind: 'user' | 'system';
    taskId: string;
    status: AutomationRunStatus;
    itemCount: number;
    error?: string;
    finishedAt: Date;
    runId: number;
    ranAt: Date;
  };
  // Upstream library data changed by Warden.
  // Sent by: the automation executor once an actuator task declaring `affects: 'media'`
  // has acted on at least one item (whether or not the run then succeeds), and by a
  // system data job that reports changes. Any future writer of library data sends it
  // directly.
  // Heard by: the media procedures, which clear every cache they own.
  // Data-change events are namespaced by the scope they affect; a new scope adds its own
  // `<scope>:changed` event rather than a discriminator on this one. The payload is empty
  // because the caches it clears are whole-scope; a discriminator is added only when a
  // consumer segments its cache and proves it needs one.
  'media:changed': Record<string, never>;
  // Provider configuration changed: which providers exist, are active, or what they serve.
  // Sent by: every `ProviderSettingsService` mutation (create, update, delete) except
  // `recordTest`, which changes only a provider's test status.
  // Heard by: `ActiveFieldSetCache` and the media procedures' caches.
  // It lives on the kernel bus so `providers` never imports from `media`.
  'provider:changed': Record<string, never>;
}

/**
 * In-process domain events between modules.
 *
 * Delivery is synchronous: every listener runs before `emit` returns (pinned by
 * `eventBus.test.ts`), so a sender's caller sees the listeners' effects as soon as the
 * call returns. `emit` re-throws a listener's exception into the sender, so a listener
 * catches its own errors. A long-lived listener subscribes once; a listener built per
 * request or per test unsubscribes with `off`.
 */
export class DomainEventBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): void {
    this.emitter.off(event, listener);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}
