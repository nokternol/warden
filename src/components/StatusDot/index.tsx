import { cn } from '@app/lib/utils/cn';
import type { AutomationStatus } from '@contract/schemas';

/** Decorative: the row beside it states the status in text. */
export default function StatusDot({ status }: { status: AutomationStatus }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
        status === 'active' && 'bg-primary',
        status === 'disabled' && 'border border-text-muted'
      )}
      aria-hidden="true"
    />
  );
}
