import AppLayout from '@app/components/AppLayout';
import AsyncBoundary from '@app/components/AsyncBoundary';
import AutomationBuilder from '@app/components/AutomationBuilder';
import AutomationRow from '@app/components/AutomationRow';
import Button from '@app/components/Button';
import EmptyState from '@app/components/EmptyState';
import QueryRow from '@app/components/QueryRow';
import SetupChecklist from '@app/components/SetupChecklist';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomations } from '@app/hooks/useAutomations';
import type { CreateAutomationInput } from '@app/hooks/useAutomations';
import { useMediaQueries } from '@app/hooks/useMediaQueries';
import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import { useMediaSources } from '@app/hooks/useMediaSources';
import { useProviderSettings } from '@app/hooks/useProviderSettings';
import { setupState } from '@app/lib/setupGuidance';
import { guardPage } from '@app/lib/utils/guardPage';
import { BookMarked, Zap } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const refusal = await guardPage(ctx);
  if (refusal) return refusal;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const router = useRouter();
  const {
    queries,
    error: queriesError,
    refresh: refreshQueries,
    remove: removeQuery,
  } = useMediaQueries();
  const {
    automations,
    error: automationsError,
    refresh: refreshAutomations,
    isCreating,
    create,
    setStatus,
    remove: removeAutomation,
    run,
  } = useAutomations({ kind: 'user' });
  const { providers } = useProviderSettings();
  const { sources } = useMediaSources();
  const [showBuilder, setShowBuilder] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  // Each fact stays undefined until its fetch has succeeded, so the guidance stays 'unknown'.
  const guidance = setupState({
    providerCount: providers?.length,
    hasSource: sources && Object.values(sources).some((source) => source.configured),
    queryCount: queries?.length,
    automationCount: automations?.length,
  });

  const handleLoad = (_query: MediaQueryRecord) => {
    void router.push('/media');
  };

  const handleCreate = async (input: CreateAutomationInput) => {
    const created = await create(input);
    setShowBuilder(false);
    setCreatedName(created.name);
  };

  const activeCount = automations?.filter((a) => a.status === 'active').length ?? 0;
  const errorCount = automations?.filter((a) => a.lastRun?.status === 'error').length ?? 0;
  const canCreate = Boolean(queries?.length) && !showBuilder;

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar
          title="Automations"
          actions={
            <Button
              type="button"
              size="sm"
              disabled={!canCreate}
              title={
                queries?.length === 0 ? 'Save a query first to create an automation' : undefined
              }
              onClick={() => {
                setCreatedName(null);
                setShowBuilder(true);
              }}
            >
              New automation
            </Button>
          }
        />
      }
    >
      <div className="p-4 sm:p-6 space-y-8 max-w-5xl">
        {guidance !== 'unknown' && guidance !== 'complete' && (
          <SetupChecklist state={guidance} onCreateAutomation={() => setShowBuilder(true)} />
        )}

        {/* ── Builder ─────────────────────────────────────────────────────── */}
        {showBuilder && queries && (
          <AutomationBuilder
            queries={queries}
            onSubmit={handleCreate}
            onCancel={() => setShowBuilder(false)}
            isSubmitting={isCreating}
          />
        )}

        {createdName && (
          <p role="status" className="text-sm text-success">
            Created {createdName}.
          </p>
        )}

        {/* ── Automations list ─────────────────────────────────────────────── */}
        <section aria-labelledby="automations-heading">
          <div className="flex flex-wrap items-center gap-x-3 mb-1">
            <h2 id="automations-heading" className="text-sm font-semibold text-text-primary">
              Your automations
            </h2>
            {automations && automations.length > 0 && (
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                <span>{activeCount} active</span>
                {errorCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-danger-text">{errorCount} error</span>
                  </>
                )}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mb-4 max-w-prose">
            Each automation applies a task to the media its queries select, on a schedule.
          </p>

          <AsyncBoundary
            data={automations}
            error={automationsError}
            onRetry={() => refreshAutomations()}
            what="automations"
            isEmpty={(list) => list.length === 0}
            empty={
              <div className="rounded-lg border border-border bg-surface-panel">
                <EmptyState
                  icon={<Zap size={28} strokeWidth={1.25} aria-hidden="true" />}
                  title="No automations yet"
                />
              </div>
            }
          >
            {(list) => (
              <div className="rounded-lg border border-border bg-surface-panel">
                {/* Column header */}
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
                    onToggle={() => {
                      void setStatus(a.id, a.status === 'active' ? 'disabled' : 'active');
                    }}
                    onDelete={() => {
                      void removeAutomation(a.id);
                    }}
                    onRun={() => run(a.id)}
                  />
                ))}
              </div>
            )}
          </AsyncBoundary>
        </section>

        {/* ── Queries ────────────────────────────────────────────────── */}
        <section aria-labelledby="media-queries-heading">
          <h2 id="media-queries-heading" className="text-sm font-semibold text-text-primary mb-1">
            Queries
          </h2>
          <p className="text-xs text-text-muted mb-4 max-w-prose">
            Named filter sets saved from the Media page.
          </p>

          <AsyncBoundary
            data={queries}
            error={queriesError}
            onRetry={() => refreshQueries()}
            what="queries"
            isEmpty={(list) => list.length === 0}
            empty={
              <div className="rounded-lg border border-border bg-surface-panel">
                <EmptyState
                  icon={<BookMarked size={28} strokeWidth={1.25} aria-hidden="true" />}
                  title="No queries yet"
                />
              </div>
            }
          >
            {(list) => (
              <div
                className="rounded-lg border border-border bg-surface-panel divide-y divide-divider"
                role="list"
                aria-label="Queries"
              >
                {list.map((query) => (
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
          </AsyncBoundary>
        </section>
      </div>
    </AppLayout>
  );
}
