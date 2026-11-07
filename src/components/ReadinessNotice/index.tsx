import type { ReadinessFinding } from '@contract/readiness';

/** Why the filters shown may not select what they describe, stated beside the results. */
export default function ReadinessNotice({ findings }: { findings: ReadinessFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div
      role="status"
      aria-label="Filter warnings"
      className="mb-4 space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text-primary"
    >
      {findings.map((finding) => (
        <p key={finding.id} className="break-words">
          {finding.message}. <span className="text-text-secondary">{finding.clears}</span>
        </p>
      ))}
    </div>
  );
}
