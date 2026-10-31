import AppLayout from '@app/components/AppLayout';
import AsyncBoundary from '@app/components/AsyncBoundary';
import Button from '@app/components/Button';
import EmptyState from '@app/components/EmptyState';
import RunRow from '@app/components/RunRow';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { RUNS_PAGE_SIZE, useAutomationRuns } from '@app/hooks/useAutomationRuns';
import { guardPage } from '@app/lib/utils/guardPage';
import { History } from 'lucide-react';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const refusal = await guardPage(ctx);
  if (refusal) return refusal;
  return { props: {} };
};

const RunsIcon = () => <History size={28} strokeWidth={1.25} aria-hidden="true" />;

export default function RunsPage() {
  const { runs, total, error, refresh, page, nextPage, prevPage } = useAutomationRuns();
  const hasMore = (page + 1) * RUNS_PAGE_SIZE < total;
  const hasPrev = page > 0;

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="Runs" />}>
      <div className="p-4 sm:p-6 max-w-5xl">
        <AsyncBoundary
          data={runs}
          error={error}
          onRetry={() => refresh()}
          what="runs"
          isEmpty={(list) => list.length === 0 && page === 0}
          empty={
            <div className="rounded-lg border border-border bg-surface-panel">
              <EmptyState
                icon={<RunsIcon />}
                title="No runs yet"
                description="Runs will appear here once your automations have executed."
              />
            </div>
          }
        >
          {(list) => (
            <div className="rounded-lg border border-border bg-surface-panel">
              <table className="w-full">
                <RunRow.Head />
                <tbody>
                  {list.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-divider">
                <span className="text-xs text-text-secondary">
                  Page {page + 1} · {total} {total === 1 ? 'run' : 'runs'}
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
            </div>
          )}
        </AsyncBoundary>
      </div>
    </AppLayout>
  );
}
