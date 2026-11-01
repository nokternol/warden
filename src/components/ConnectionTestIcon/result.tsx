import ConnectionTestIcon, { type TestStatus } from './index';

const LABELS: Record<Exclude<TestStatus, 'idle'>, string> = {
  loading: 'Testing connection…',
  pass: 'Connection succeeded',
  fail: 'Connection failed',
};

/** A connection test's outcome, announced politely and kept apart from any field's label. */
export function ConnectionTestResult({ status, error }: { status: TestStatus; error?: string }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
      {status !== 'idle' && (
        <>
          <ConnectionTestIcon status={status} />
          <span>{LABELS[status]}</span>
          {status === 'fail' && error && (
            <span className="text-danger-text break-words">{error}</span>
          )}
        </>
      )}
    </p>
  );
}
