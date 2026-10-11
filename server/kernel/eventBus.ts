import { EventEmitter } from 'node:events';

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
    status: 'success' | 'error' | 'skipped';
    itemCount: number;
    error?: string;
    finishedAt: Date;
    runId: number;
    ranAt: Date;
  };
  // Data-change events are namespaced by the scope they affect: a task declaring
  // `affects: 'media'` emits `media:changed`. New scopes add their own
  // `<scope>:changed` event rather than overloading one event with a discriminator.
  // The payload is intentionally empty — the cache it drives is whole-scope, so the
  // event only needs to say *that* media changed, not which slice. A discriminator
  // is added only if/when a consumer segments its cache and proves it needs one.
  'media:changed': Record<string, never>;
  // Emitted by ProviderSettingsService.create/update wherever a provider's active-type
  // membership can change — the trigger media's active-field-set cache invalidates on.
  // Lives on the kernel bus (not a media import into providers) so providers stays
  // ignorant of media's EnrichmentFields/field-ownership concerns.
  'provider:changed': Record<string, never>;
}

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
