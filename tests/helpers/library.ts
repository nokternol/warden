import type { Cradle } from '@server/container';

/**
 * Runs the catalog refresh as its system automation would, so the library copy holds what the
 * mocked providers answer, then tells the cache the copy changed.
 */
export async function refreshCatalog(
  cradle: Pick<Cradle, 'systemTaskRunner' | 'eventBus'>
): Promise<void> {
  await cradle.systemTaskRunner.run('system:identity-resolution');
  cradle.eventBus.emit('media:changed', {});
}
