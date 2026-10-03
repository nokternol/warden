import AppLayout from '@app/components/AppLayout';
import Button from '@app/components/Button';
import Card from '@app/components/Card';
import EmptyState from '@app/components/EmptyState';
import RunRow from '@app/components/RunRow';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomationRuns } from '@app/hooks/useAutomationRuns';
import { requireAuth } from '@app/lib/utils/requireAuth';
import { History } from 'lucide-react';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

const RunsIcon = () => <History className="w-12 h-12" strokeWidth={1.5} />;

export default function RunsPage() {
  const { runs, isLoading, page, nextPage, prevPage } = useAutomationRuns();
  const PAGE_SIZE = 25;
  const hasMore = runs.length === PAGE_SIZE;
  const hasPrev = page > 0;

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="Runs" />}>
      <div className="p-6">
        <Card variant="outlined" padding="none">
          {isLoading ? (
            <div className="p-8 text-center text-[var(--color-text-secondary)] text-sm">
              Loading runs…
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={<RunsIcon />}
              title="No runs yet"
              description="Runs will appear here once your automations have executed."
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
