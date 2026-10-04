import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { summarizeFilters } from '@app/lib/utils/filterSummary';
import { Clapperboard, Trash2 } from 'lucide-react';
import { useState } from 'react';

export default function QueryRow({
  query,
  onLoad,
  onDelete,
}: {
  query: MediaQueryRecord;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const parts = summarizeFilters(query.filters);
  const date = new Date(query.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5 group hover:bg-surface-bg/50 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary leading-tight truncate">{query.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {parts.length > 0 ? (
            parts.slice(0, 6).map((part) => (
              <span
                key={part}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface-bg text-text-muted border border-border leading-none"
              >
                {part}
              </span>
            ))
          ) : (
            <span className="text-xs text-text-muted italic">No filters</span>
          )}
          {parts.length > 6 && (
            <span className="text-[11px] text-text-muted">+{parts.length - 6} more</span>
          )}
        </div>
        <p className="text-[11px] text-text-muted mt-1.5">{date}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
        {confirming ? (
          <>
            <span className="text-xs text-danger font-medium">Delete?</span>
            <button
              type="button"
              onClick={onDelete}
              className="px-2.5 py-1 text-xs font-medium rounded-sm bg-danger text-white hover:bg-danger-hover transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2.5 py-1 text-xs font-medium rounded-sm bg-surface-panel border border-border text-text-secondary hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onLoad}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-sm bg-surface-panel border border-border text-text-secondary hover:text-text-primary hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Clapperboard size={12} strokeWidth={2} aria-hidden="true" />
              Load
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete query "${query.name}"`}
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
