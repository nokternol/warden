import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import { useFilterSummaryLookups } from '@app/hooks/useMediaLookups';
import type { MediaQueryRecord, QueryHealth } from '@app/hooks/useMediaQueries';
import { useMediaRules } from '@app/hooks/useMediaRules';
import { summarizeFilters } from '@app/lib/utils/filterSummary';
import { Clapperboard, Trash2 } from 'lucide-react';
import { useState } from 'react';

const HEALTH_BADGE = {
  degraded: { variant: 'warning', label: 'Degraded' },
  unavailable: { variant: 'error', label: 'Unavailable' },
} as const;

const ISSUE_REASONS = {
  not_active: 'names a provider that is not active',
  wrong_automation_provider: "names a different provider from its automation's",
} as const;

function healthReasons(health: QueryHealth): string[] {
  return [
    ...health.providerStatus
      .filter((provider) => !provider.configured)
      .map((provider) => `${provider.providerType} is not configured.`),
    ...health.qualificationIssues.map(
      (issue) => `The ${issue.filterKey} filter ${ISSUE_REASONS[issue.reason]}.`
    ),
  ];
}

export default function QueryRow({
  query,
  onLoad,
  onDelete,
}: {
  query: MediaQueryRecord;
  onLoad: () => void;
  /** Rejects when the delete fails; the confirmation then stays and says why. */
  onDelete: () => unknown;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { rules } = useMediaRules();
  const lookups = useFilterSummaryLookups();
  const parts = summarizeFilters(query.filters, rules, lookups);
  const date = new Date(query.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete the query.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-primary break-words min-w-0">
              {query.name}
            </p>
            {query.health.status !== 'healthy' && (
              <Badge variant={HEALTH_BADGE[query.health.status].variant} size="sm">
                {HEALTH_BADGE[query.health.status].label}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {parts.length > 0 ? (
              parts.map((part) => (
                <span
                  key={part}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs bg-surface-bg text-text-secondary border border-border"
                >
                  {part}
                </span>
              ))
            ) : (
              <span className="text-xs text-text-muted">No filters</span>
            )}
          </div>
          {healthReasons(query.health).map((reason) => (
            <p key={reason} className="text-xs text-text-secondary mt-1.5">
              {reason}
            </p>
          ))}
          <p className="text-xs text-text-muted mt-1.5">{date}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {confirming ? (
            <>
              <span className="text-xs text-danger-text font-medium">Delete?</span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={() => {
                  void remove();
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`Load ${query.name} in Media`}
                disabled={!rules}
                onClick={onLoad}
                className="gap-1.5"
              >
                <Clapperboard size={16} strokeWidth={2} aria-hidden="true" />
                Load
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Delete query "${query.name}"`}
                className="flex items-center justify-center size-11 lg:size-8 rounded text-text-muted hover:text-danger-text hover:bg-danger/10 transition-colors duration-150"
              >
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {deleteError}
        </p>
      )}
    </div>
  );
}
