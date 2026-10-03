import AutomationRow from '@app/components/AutomationRow';
import Card from '@app/components/Card';
import EmptyState from '@app/components/EmptyState';
import type { AutomationDto } from '@app/hooks/useAutomations';
import { cn } from '@app/lib/utils/cn';
import { relativeTime } from '@app/lib/utils/time';
import { Zap } from 'lucide-react';
import { useRouter } from 'next/router';

const EmptyAutomationIcon = () => (
  <svg
    className="w-12 h-12"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

// ─── DashboardContent ──────────────────────────────────────────────────────────

export function DashboardContent({ automations }: { automations: AutomationDto[] }) {
  const router = useRouter();
  const activeCount = automations.filter((a) => a.status === 'active').length;
  const disabledCount = automations.filter((a) => a.status === 'disabled').length;

  const recentRuns = automations
    .filter((a) => a.lastRun)
    .sort((a, b) => new Date(b.lastRun!.at).getTime() - new Date(a.lastRun!.at).getTime())
    .slice(0, 10);

  return (
    <div className="p-6 space-y-4">
      <Card variant="outlined" padding="none">
        <Card.Header>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Automations</h2>
            {automations.length > 0 && (
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                {activeCount > 0 && <span className="text-primary">{activeCount} active</span>}
                {activeCount > 0 && disabledCount > 0 && <span className="opacity-40">·</span>}
                {disabledCount > 0 && (
                  <span className="text-warning">{disabledCount} disabled</span>
                )}
              </span>
            )}
          </div>
        </Card.Header>

        {automations.length === 0 ? (
          <Card.Content divided>
            <EmptyState
              icon={<EmptyAutomationIcon />}
              title="No automations yet"
              description="An automation pairs a query with a task on a schedule. Save a query from the Media page, then create an automation."
              action={{
                label: '+ New automation',
                onClick: () => void router.push('/automations'),
              }}
            />
          </Card.Content>
        ) : (
          <>
            <div className="hidden sm:grid sm:grid-cols-[1fr_160px_168px] lg:grid-cols-[1fr_160px_168px_88px] items-center px-4 py-2 border-b border-border bg-surface-bg/30">
              <span className="text-xs font-medium text-text-muted">Automation</span>
              <span className="text-xs font-medium text-text-muted">Schedule</span>
              <span className="text-xs font-medium text-text-muted">Last run</span>
              <span className="hidden lg:block text-xs font-medium text-text-muted text-right">
                Next run
              </span>
            </div>
            {automations.map((a) => (
              <AutomationRow
                key={a.id}
                automation={a}
                onToggle={() => void router.push('/automations')}
                onDelete={() => void router.push('/automations')}
              />
            ))}
          </>
        )}
      </Card>

      <Card variant="outlined" padding="none">
        <Card.Header>
          <h2 className="text-sm font-semibold text-text-primary">Recent runs</h2>
        </Card.Header>
        <Card.Content divided>
          {recentRuns.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <Zap size={28} strokeWidth={1.25} className="text-text-muted" aria-hidden="true" />
              <p className="text-sm font-medium text-text-secondary">No runs yet</p>
              <p className="text-xs text-text-muted max-w-xs">
                Run history will appear here once your automations have executed.
              </p>
            </div>
          ) : (
            recentRuns.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 py-2.5 border-b border-border last:border-0 text-sm min-w-0"
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    a.lastRun!.status === 'error' ? 'bg-danger' : 'bg-primary'
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium text-text-secondary truncate">{a.name}</span>
                <span className="text-text-muted/50 flex-shrink-0">·</span>
                <span className="text-text-muted flex-shrink-0">{a.lastRun!.itemCount} items</span>
                <span className="ml-auto flex-shrink-0 text-xs text-text-muted">
                  {relativeTime(a.lastRun!.at)}
                </span>
              </div>
            ))
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
