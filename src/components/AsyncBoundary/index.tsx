import Button from '@app/components/Button';
import { Skeleton } from '@app/components/Skeleton';
import { useState } from 'react';

/** A failed load: what could not be loaded, and a way to try again. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => unknown }) {
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3"
    >
      <p className="text-sm text-text-primary">Couldn't load {what}.</p>
      <Button type="button" variant="secondary" size="sm" loading={retrying} onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

/** Placeholder rows for a list that has not loaded yet. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-border bg-surface-panel divide-y divide-divider"
    >
      {Array.from({ length: count }, (_, i) => `row-${i}`).map((row) => (
        <div key={row} className="px-4 py-3 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

interface AsyncBoundaryProps<T> {
  /** Absent until the first successful load. */
  data: T | undefined;
  error: unknown;
  onRetry: () => unknown;
  /** Names the data in the failure message, e.g. "providers". */
  what: string;
  isEmpty: (data: T) => boolean;
  empty: React.ReactNode;
  loading?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}

/**
 * The one loading / error / empty / ready pattern. A failure never reads as an empty result, and
 * a failed refresh of data already on screen keeps that data under the failure message.
 */
export default function AsyncBoundary<T>({
  data,
  error,
  onRetry,
  what,
  isEmpty,
  empty,
  loading,
  children,
}: AsyncBoundaryProps<T>) {
  if (data === undefined) {
    return error ? <LoadError what={what} onRetry={onRetry} /> : (loading ?? <SkeletonRows />);
  }
  return (
    <>
      {error ? <LoadError what={what} onRetry={onRetry} /> : null}
      {isEmpty(data) ? empty : children(data)}
    </>
  );
}
