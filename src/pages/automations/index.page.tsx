import AppLayout from '@app/components/AppLayout';
import AutomationBuilder from '@app/components/AutomationBuilder';
import AutomationRow from '@app/components/AutomationRow';
import QueryRow from '@app/components/QueryRow';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomations } from '@app/hooks/useAutomations';
import type { CreateAutomationInput } from '@app/hooks/useAutomations';
import { useMediaQueries } from '@app/hooks/useMediaQueries';
import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { cn } from '@app/lib/utils/cn';
import { requireAuth } from '@app/lib/utils/requireAuth';
import { BookMarked, Clapperboard, Zap } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const router = useRouter();
  const { queries, remove: removeQuery } = useMediaQueries();
  const {
    automations,
    isCreating,
    create,
    setStatus,
    remove: removeAutomation,
    run,
  } = useAutomations();
  const [showBuilder, setShowBuilder] = useState(false);

  const handleLoad = (_query: MediaQueryRecord) => {
    void router.push('/media');
  };

  const handleCreate = async (input: CreateAutomationInput) => {
    await create(input);
    setShowBuilder(false);
  };

  const activeCount = automations.filter((a) => a.status === 'active').length;
  const errorCount = automations.filter((a) => a.lastRun?.status === 'error').length;

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar
          title="Automations"
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
          actions={
            <button
              type="button"
              disabled={queries.length === 0 || showBuilder}
              title={
                queries.length === 0 ? 'Save a query first to create an automation' : undefined
              }
              onClick={() => setShowBuilder(true)}
              className={cn(
                'px-4 py-2 text-white text-sm font-medium rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg',
                queries.length === 0 || showBuilder
                  ? 'bg-primary/40 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-hover'
              )}
            >
              + New automation
            </button>
          }
        />
      }
    >
      <div className="p-6 space-y-8 max-w-4xl">
        {/* ── Builder ─────────────────────────────────────────────────────── */}
        {showBuilder && (
          <AutomationBuilder
            queries={queries}
            onSubmit={(input) => {
              void handleCreate(input);
            }}
            onCancel={() => setShowBuilder(false)}
            isSubmitting={isCreating}
          />
        )}

        {/* ── Automations list ─────────────────────────────────────────────── */}
        <section aria-labelledby="automations-heading">
          <div className="flex items-center gap-3 mb-1">
            <Zap
              size={16}
              strokeWidth={1.75}
              className={automations.length > 0 ? 'text-primary' : 'text-text-muted'}
              aria-hidden="true"
            />
            <h2 id="automations-heading" className="text-sm font-semibold text-text-primary">
              Automations
            </h2>
            {automations.length > 0 && (
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                {activeCount > 0 && <span className="text-primary">{activeCount} active</span>}
                {activeCount > 0 && errorCount > 0 && <span className="opacity-40">·</span>}
                {errorCount > 0 && <span className="text-danger">{errorCount} error</span>}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mb-4 ml-[28px]">
            Each automation pairs a query with a task and a cron schedule.
          </p>

          {automations.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-panel overflow-hidden">
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
                <Zap size={28} strokeWidth={1.25} className="text-text-muted" aria-hidden="true" />
                <p className="text-sm font-medium text-text-secondary">No automations yet</p>
                <p className="text-xs text-text-muted max-w-xs">
                  {queries.length === 0
                    ? 'Save a query from the media page, then create an automation to run it on a schedule.'
                    : 'Select a query above and click "+ New automation" to get started.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-panel overflow-hidden">
              {/* Column header */}
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
                  onToggle={() => {
                    void setStatus(a.id, a.status === 'active' ? 'paused' : 'active');
                  }}
                  onDelete={() => {
                    void removeAutomation(a.id);
                  }}
                  onRun={() => run(a.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Queries ────────────────────────────────────────────────── */}
        <section aria-labelledby="media-queries-heading">
          <div className="flex items-center gap-3 mb-1">
            <BookMarked
              size={16}
              strokeWidth={1.75}
              className="text-primary flex-shrink-0"
              aria-hidden="true"
            />
            <h2 id="media-queries-heading" className="text-sm font-semibold text-text-primary">
              Queries
            </h2>
          </div>
          <p className="text-xs text-text-muted mb-4 ml-[28px]">
            Named filter sets from the Media page. Each automation targets one query.
          </p>

          {queries.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-panel overflow-hidden">
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
                <BookMarked
                  size={28}
                  strokeWidth={1.25}
                  className="text-text-muted"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-text-secondary">No queries yet</p>
                <p className="text-xs text-text-muted max-w-xs">
                  Go to the Media page, apply any combination of filters, and use the "Save as
                  query" button to save them here.
                </p>
                <a
                  href="/media"
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-primary text-white hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
                >
                  <Clapperboard size={12} strokeWidth={2} aria-hidden="true" />
                  Go to Media
                </a>
              </div>
            </div>
          ) : (
            <div
              className="rounded-lg border border-border bg-surface-panel overflow-hidden divide-y divide-divider"
              role="list"
              aria-label="Queries"
            >
              {queries.map((query) => (
                <div key={query.id} role="listitem">
                  <QueryRow
                    query={query}
                    onLoad={() => handleLoad(query)}
                    onDelete={() => {
                      void removeQuery(query.id);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
