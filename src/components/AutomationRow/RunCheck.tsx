import Button from '@app/components/Button';
import { blastRadius } from '@app/lib/blastRadius';
import type { AutomationReadiness } from '@contract/automations';

/**
 * What a Run Now would do, asked before it runs: findings awaiting sign-off to proceed past for
 * this run only, problems that will skip it, and how many items a destructive task will affect.
 * A count that failed is said, but does not hide the findings or stop the run being started.
 */
export default function RunCheck({
  readiness,
  failed,
  taskLabel,
  destructive,
  onConfirm,
  onCancel,
  onRetry,
}: {
  readiness?: AutomationReadiness;
  /** The readiness check itself could not be read. */
  failed?: boolean;
  taskLabel: string;
  destructive: boolean;
  onConfirm: (consentedFindings: string[]) => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const awaiting = readiness?.blocks.awaitingSignOff ?? [];
  const asks = readiness?.runNow === 'asks';
  const stops = readiness?.runNow === 'stops';
  const reasons = readiness
    ? [...readiness.problems, ...readiness.blocks.needsFix.map((f) => f.message)]
    : [];
  const radius = blastRadius({
    data:
      readiness && readiness.count !== null
        ? { count: readiness.count, contentType: readiness.contentType }
        : undefined,
    error: readiness?.countError !== undefined ? new Error(readiness.countError) : undefined,
  });

  return (
    <div className="mt-3 lg:col-span-full space-y-2 rounded border border-warning/40 bg-warning/10 px-3 py-2.5">
      {!readiness && (
        <p className="text-sm text-text-primary">
          {failed ? "Couldn't check this automation." : 'Checking this automation…'}
        </p>
      )}
      {stops && (
        <div className="text-sm text-text-primary">
          <p>This run will be skipped:</p>
          <ul className="list-disc pl-5">
            {reasons.map((reason) => (
              <li key={reason} className="break-words">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {asks && (
        <div className="text-sm text-text-primary">
          <p>There appears to be no data for:</p>
          <ul className="list-disc pl-5">
            {awaiting.map((f) => (
              <li key={f.id} className="break-words">
                {f.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-secondary">
            Proceed applies to this run only; its schedule still waits for sign-off.
          </p>
        </div>
      )}
      {readiness && !stops && destructive && (
        <p className="text-sm text-text-primary">
          {radius.state === 'counted' ? `${taskLabel} ${radius.phrase}.` : radius.phrase}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(failed || (readiness && radius.state === 'failed')) && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {readiness ? 'Retry count' : 'Retry'}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? 'danger' : 'primary'}
          size="sm"
          disabled={!readiness}
          onClick={() => onConfirm(asks ? awaiting.map((f) => f.id) : [])}
        >
          {asks ? 'Proceed' : 'Run now'}
        </Button>
      </div>
    </div>
  );
}
