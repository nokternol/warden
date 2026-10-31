export type TestStatus = 'idle' | 'loading' | 'pass' | 'fail';

export default function ConnectionTestIcon({ status }: { status: TestStatus }) {
  if (status === 'idle') return null;
  if (status === 'loading') {
    return (
      <svg
        className="inline-block w-4 h-4 animate-spin text-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
  }
  if (status === 'pass') {
    return (
      <svg
        className="inline-block w-4 h-4 text-success"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg
      className="inline-block w-4 h-4 text-danger-text"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
