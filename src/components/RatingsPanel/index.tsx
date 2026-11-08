import RatingsDisplay from '@app/components/RatingsDisplay';
import type { TitleRating } from '@contract/ratings';
import { useEffect, useRef } from 'react';

interface RatingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  year?: number;
  /** The selected title's ratings, read from its own record. */
  ratings: TitleRating[];
}

export default function RatingsPanel({ isOpen, onClose, title, year, ratings }: RatingsPanelProps) {
  const triggerRef = useRef<Element | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
              <RatingsDisplay ratings={ratings} />
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
