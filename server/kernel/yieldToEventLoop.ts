/**
 * Lets pending requests run. The database driver completes on the main thread without returning to the
 * event loop, so a loop of awaited writes answers no request until it ends; a job over a whole library
 * calls this between items.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
