import AppLayout from '@app/components/AppLayout';
import Badge from '@app/components/Badge';
import Button from '@app/components/Button';
import Card from '@app/components/Card';
import EmptyState from '@app/components/EmptyState';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { useAutomationRuns } from '@app/hooks/useAutomationRuns';
import { requireAuth } from '@app/lib/utils/requireAuth';
import { Activity } from 'lucide-react';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

const ActivityIcon = () => <Activity className="w-12 h-12" strokeWidth={1.5} />;

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function RunRow({ run }: { run: AutomationRunDto }) {
  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-white">{run.automationName}</td>
      <td className="px-4 py-3">
        <Badge variant={run.status === 'success' ? 'success' : 'error'} size="sm">
          {run.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {formatDate(run.ranAt)}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {run.itemCount !== null ? run.itemCount : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
        {run.error ? (
          <span className="text-red-400" title={run.error}>
            {run.error.length > 60 ? `${run.error.slice(0, 60)}…` : run.error}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

export default function ActivityPage() {
  const { runs, isLoading, page, nextPage, prevPage } = useAutomationRuns();
  const PAGE_SIZE = 25;
  const hasMore = runs.length === PAGE_SIZE;
  const hasPrev = page > 0;

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar title="Activity" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]} />
      }
    >
      <div className="p-6">
        <Card variant="outlined" padding="none">
          {isLoading ? (
            <div className="p-8 text-center text-[var(--color-text-secondary)] text-sm">
              Loading activity…
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={<ActivityIcon />}
              title="No activity yet"
              description="Run history and task events will appear here once your automations have executed."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                        Automation
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                        Ran At
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                        Items
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <RunRow key={run.id} run={run} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-xs text-[var(--color-text-secondary)]">
                  Page {page + 1} · {runs.length} {runs.length === 1 ? 'run' : 'runs'}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={prevPage} disabled={!hasPrev}>
                    Previous
                  </Button>
                  <Button variant="secondary" size="sm" onClick={nextPage} disabled={!hasMore}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
