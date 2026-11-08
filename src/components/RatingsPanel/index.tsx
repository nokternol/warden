import LoadingSpinner from '@app/components/LoadingSpinner';
import RatingsDisplay from '@app/components/RatingsDisplay';
import { useRatings } from '@app/hooks/useRatings';
import { useEffect, useRef } from 'react';

interface RatingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  year?: number;
}

export default function RatingsPanel({ isOpen, onClose, title, year }: RatingsPanelProps) {
  const { trigger, data, error, isLoading } = useRatings();
  const triggerRef = useRef<Element | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && title) {
      trigger({ title, year });
    }
  }, [isOpen, title, year, trigger]);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      closeButtonRef.current?.focus();
    } else {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [isOpen]);

  return (
    <>
      {/* Always in DOM so the live region is registered before isOpen changes */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen && title ? `Ratings panel open: ${title}` : ''}
      </div>

      {isOpen && (
        <dialog open aria-label={`Ratings for ${title}`} onCancel={onClose} className="contents">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-md z-50 flex flex-col bg-surface-elevated shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
                {year && <p className="text-sm text-text-secondary">{year}</p>}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="p-2 rounded hover:bg-surface-panel text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <LoadingSpinner size="md" className="text-primary" />
                  <p className="text-sm text-text-secondary">Loading ratings…</p>
                </div>
              )}
              {error && !isLoading && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <svg
                    className="w-8 h-8 text-danger"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <p className="text-sm text-text-secondary max-w-xs">
                    {error.message || 'Failed to load ratings.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => trigger({ title, year })}
                    className="mt-1 px-4 py-2 rounded-sm text-sm font-medium bg-surface-panel border border-border text-text-secondary hover:text-text-primary hover:bg-surface-bg transition-colors duration-150"
                  >
                    Try again
                  </button>
                </div>
              )}
              {data && !error && (
                <div className="flex flex-col gap-6">
                  <RatingsDisplay ratings={[]} />
                  {/* Identity Section */}
                  {(data.ids.tmdbId || data.ids.imdbId || data.ids.tvdbId || data.ids.tvMazeId) && (
                    <div className="border-t border-border pt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">
                        Identity
                      </h3>
                      <div className="flex flex-col gap-2">
                        {data.ids.tmdbId && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-text-secondary">TMDB</span>
                            <code className="text-sm font-mono text-text-primary">
                              {data.ids.tmdbId}
                            </code>
                          </div>
                        )}
                        {data.ids.imdbId && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-text-secondary">IMDb</span>
                            <code className="text-sm font-mono text-text-primary">
                              {data.ids.imdbId}
                            </code>
                          </div>
                        )}
                        {data.ids.tvdbId && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-text-secondary">TVDB</span>
                            <code className="text-sm font-mono text-text-primary">
                              {data.ids.tvdbId}
                            </code>
                          </div>
                        )}
                        {data.ids.tvMazeId && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-text-secondary">TVMaze</span>
                            <code className="text-sm font-mono text-text-primary">
                              {data.ids.tvMazeId}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
