import { cn } from '@app/lib/utils/cn';
import type { AutomationStatus } from '@contract/schemas';

export default function StatusDot({ status }: { status: AutomationStatus | 'error' }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0 mt-[3px]',
        status === 'active' && 'bg-primary',
        status === 'disabled' && 'bg-warning',
        status === 'error' && 'bg-danger'
      )}
      aria-hidden="true"
    />
  );
}
