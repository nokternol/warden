import Button from '@app/components/Button';
import type { SetupState } from '@app/lib/setupGuidance';
import { cn } from '@app/lib/utils/cn';
import { Check } from 'lucide-react';

interface SetupChecklistProps {
  state: Exclude<SetupState, 'unknown' | 'complete'>;
  onCreateAutomation: () => void;
}

type StepStatus = 'done' | 'current' | 'upcoming';

const LINK_CLASS =
  'mt-2 inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors';

type IncompleteState = SetupChecklistProps['state'];

interface StepDefinition {
  title: string;
  /** The states in which this step is the one next action. */
  currentIn: readonly IncompleteState[];
  hint: (state: IncompleteState) => string;
  action: (onCreateAutomation: () => void) => React.ReactNode;
}

const STEPS: readonly StepDefinition[] = [
  {
    title: 'Connect a source',
    currentIn: ['no-providers', 'no-source'],
    hint: (state) =>
      state === 'no-source'
        ? 'None of your providers is an active source. Add or enable Radarr or Sonarr.'
        : 'Add Radarr or Sonarr so Warden has media to work with.',
    action: () => (
      <a href="/settings" className={LINK_CLASS}>
        Open settings
      </a>
    ),
  },
  {
    title: 'Save a query',
    currentIn: ['no-query'],
    hint: () => 'Filter your media, then save the filters as a query.',
    action: () => (
      <a href="/media" className={LINK_CLASS}>
        Go to Media
      </a>
    ),
  },
  {
    title: 'Create an automation',
    currentIn: ['no-automation'],
    hint: () => 'Pair a query with a task and a schedule.',
    action: (onCreateAutomation) => (
      <Button type="button" size="sm" className="mt-2" onClick={onCreateAutomation}>
        New automation
      </Button>
    ),
  },
];

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
        status === 'current' && 'border-primary bg-primary text-on-primary',
        status === 'done' && 'border-success text-success',
        status === 'upcoming' && 'border-border text-text-secondary'
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
            status === 'current' ? 'font-semibold text-text-primary' : 'text-text-secondary'
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
  const current = STEPS.findIndex((step) => step.currentIn.includes(state));

  return (
    <ol
      aria-label="Setup"
      className="rounded-lg border border-border bg-surface-panel divide-y divide-divider"
    >
      {STEPS.map((step, index) => (
        <Step
          key={step.title}
          number={index + 1}
          status={stepStatus(index, current)}
          title={step.title}
        >
          {index === current && (
            <>
              <p className="mt-1 text-xs text-text-secondary">{step.hint(state)}</p>
              {step.action(onCreateAutomation)}
            </>
          )}
        </Step>
      ))}
    </ol>
  );
}
