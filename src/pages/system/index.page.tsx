import AppLayout from '@app/components/AppLayout';
import AsyncBoundary from '@app/components/AsyncBoundary';
import AutomationRow from '@app/components/AutomationRow';
import EmptyState from '@app/components/EmptyState';
import MediaResetControl from '@app/components/MediaResetControl';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomations } from '@app/hooks/useAutomations';
import { useMediaReset } from '@app/hooks/useMediaReset';
import { guardPage } from '@app/lib/utils/guardPage';
import { Monitor } from 'lucide-react';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const refusal = await guardPage(ctx);
  if (refusal) return refusal;
  return { props: {} };
};

export default function SystemPage() {
  const { automations, error, refresh, run } = useAutomations({ kind: 'system' });
  const { reset } = useMediaReset();

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="System" />}>
      <div className="p-4 sm:p-6 space-y-8 max-w-5xl">
        <section aria-labelledby="system-automations-heading">
          <h2
            id="system-automations-heading"
            className="text-sm font-semibold text-text-primary mb-1"
          >
            System automations
          </h2>
          <p className="text-xs text-text-muted mb-4 max-w-prose">
            Built-in data jobs. Their task and schedule are fixed; you can run them on demand.
          </p>

          <AsyncBoundary
            data={automations}
            error={error}
            onRetry={() => refresh()}
            what="system automations"
            isEmpty={(list) => list.length === 0}
            empty={
              <div className="rounded-lg border border-border bg-surface-panel">
                <EmptyState
                  icon={<Monitor size={28} strokeWidth={1.25} aria-hidden="true" />}
                  title="No system automations"
                  description="Warden restores these on its next start."
                />
              </div>
            }
          >
            {(list) => (
              <div className="rounded-lg border border-border bg-surface-panel">
                <div className="hidden sm:grid sm:grid-cols-[1fr_160px_168px_88px] items-center px-4 py-2 border-b border-divider">
                  <span className="text-xs font-medium text-text-muted">Automation</span>
                  <span className="text-xs font-medium text-text-muted">Schedule</span>
                  <span className="text-xs font-medium text-text-muted">Last run</span>
                  <span className="text-xs font-medium text-text-muted">Next run</span>
                </div>
                {list.map((a) => (
                  <AutomationRow
                    key={a.id}
                    automation={a}
                    // System rows expose only Run-now; toggle/delete are never rendered for kind=system.
                    onToggle={() => {}}
                    onDelete={() => {}}
                    onRun={() => run(a.id)}
                  />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </section>

        <section aria-labelledby="media-reset-heading">
          <h2 id="media-reset-heading" className="text-sm font-semibold text-text-primary mb-1">
            Media data
          </h2>
          <p className="text-xs text-text-muted mb-4 max-w-prose">
            Clears Warden's stored identities and enrichment so they can be rebuilt. Your providers
            and their libraries are not touched.
          </p>
          <MediaResetControl
            onReset={async () => {
              const result = await reset();
              if (!result) throw new Error('Failed to reset media data');
              return result;
            }}
          />
        </section>
      </div>
    </AppLayout>
  );
}
