import AppLayout from '@app/components/AppLayout';
import AutomationRow from '@app/components/AutomationRow';
import EmptyState from '@app/components/EmptyState';
import MediaResetControl from '@app/components/MediaResetControl';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomations } from '@app/hooks/useAutomations';
import { useMediaReset } from '@app/hooks/useMediaReset';
import { requireAuth } from '@app/lib/utils/requireAuth';
import { Monitor } from 'lucide-react';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

const MonitorIcon = () => <Monitor className="w-12 h-12" strokeWidth={1.5} />;

export default function SystemPage() {
  const { automations, isLoading, run } = useAutomations({ kind: 'system' });
  const { reset } = useMediaReset();

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="System" />}>
      <div className="p-6 max-w-4xl">
        <section aria-labelledby="system-automations-heading">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-3">
              <Monitor size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
              <h2
                id="system-automations-heading"
                className="text-sm font-semibold text-text-primary"
              >
                System automations
              </h2>
            </div>
            <MediaResetControl
              onReset={async () => {
                const result = await reset();
                if (!result) throw new Error('Failed to reset media data');
                return result;
              }}
            />
          </div>
          <p className="text-xs text-text-muted mb-4 ml-[28px]">
            Built-in data jobs. Their task and schedule are fixed; you can pause or run them on
            demand.
          </p>

          {!isLoading && automations.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-panel overflow-hidden">
              <EmptyState
                icon={<MonitorIcon />}
                title="No system automations"
                description="System data jobs will appear here once configured."
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-panel overflow-hidden">
              <div className="hidden sm:grid sm:grid-cols-[1fr_160px_168px_88px] items-center px-4 py-2 border-b border-border bg-surface-bg/30">
                <span className="text-xs font-medium text-text-muted">Automation</span>
                <span className="text-xs font-medium text-text-muted">Schedule</span>
                <span className="text-xs font-medium text-text-muted">Last run</span>
                <span className="text-xs font-medium text-text-muted">Next run</span>
              </div>
              {automations.map((a) => (
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
        </section>
      </div>
    </AppLayout>
  );
}
