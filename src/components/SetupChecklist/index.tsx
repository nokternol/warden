import type { SetupState } from '@app/lib/setupGuidance';
import { cn } from '@app/lib/utils/cn';
import { Check } from 'lucide-react';

interface SetupChecklistProps {
  state: Exclude<SetupState, 'complete'>;
  onCreateAutomation: () => void;
}

type StepStatus = 'done' | 'current' | 'upcoming';

const LINK_CLASS =
  'mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-sm bg-primary text-white hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg';

const CURRENT_STEP_INDEX: Record<SetupChecklistProps['state'], number> = {
  'no-providers': 0,
  'no-source': 0,
  'no-query': 1,
  'no-automation': 2,
};

function stepStatus(index: number, current: number): StepStatus {
  if (index < current) return 'done';
  return index === current ? 'current' : 'upcoming';
}

function StepMarker({ number, status }: { number: number; status: StepStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
        status === 'current' && 'border-primary bg-primary text-white',
        status === 'done' && 'border-success text-success',
        status === 'upcoming' && 'border-border text-text-muted'
      )}
    >
      {status === 'done' ? <Check size={12} strokeWidth={2.5} /> : number}
    </span>
  );
}

function Step({
  number,
  status,
  title,
  children,
}: {
  number: number;
  status: StepStatus;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      aria-current={status === 'current' ? 'step' : undefined}
      className="flex items-start gap-3 px-4 py-3"
    >
      <StepMarker number={number} status={status} />
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm',
            status === 'current' ? 'font-semibold text-text-primary' : 'text-text-muted'
          )}
        >
          {title}
          {status === 'done' && <span className="sr-only"> (done)</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

export default function SetupChecklist({ state, onCreateAutomation }: SetupChecklistProps) {
  const current = CURRENT_STEP_INDEX[state];

  return (
    <ol
      aria-label="Setup"
      className="rounded-lg border border-border bg-surface-panel divide-y divide-divider"
    >
      <Step number={1} status={stepStatus(0, current)} title="Connect a source">
        {current === 0 && (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              {state === 'no-source'
                ? 'None of your providers is a source. Add Radarr or Sonarr.'
                : 'Add Radarr or Sonarr so Warden has media to work with.'}
            </p>
            <a href="/settings" className={LINK_CLASS}>
              Open settings
            </a>
          </>
        )}
      </Step>
      <Step number={2} status={stepStatus(1, current)} title="Save a query">
        {current === 1 && (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              Filter your media, then save the filters as a query.
            </p>
            <a href="/media" className={LINK_CLASS}>
              Go to Media
            </a>
          </>
        )}
      </Step>
      <Step number={3} status={stepStatus(2, current)} title="Create an automation">
        {current === 2 && (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              Pair a query with a task and a schedule.
            </p>
            <button type="button" onClick={onCreateAutomation} className={LINK_CLASS}>
              New automation
            </button>
          </>
        )}
      </Step>
    </ol>
  );
}
