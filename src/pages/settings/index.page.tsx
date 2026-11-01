import AddProviderForm from '@app/components/AddProviderForm';
import AppLayout from '@app/components/AppLayout';
import AsyncBoundary from '@app/components/AsyncBoundary';
import Button from '@app/components/Button';
import EmptyState from '@app/components/EmptyState';
import ProviderCard from '@app/components/ProviderCard';
import SidebarNav from '@app/components/SidebarNav';
import { Skeleton } from '@app/components/Skeleton';
import TopBar from '@app/components/TopBar';
import type { CreateProviderParams, ProviderSummary } from '@app/hooks/useProviderSettings';
import { useProviderSettings } from '@app/hooks/useProviderSettings';
import { tasksForProvider, useProviderTasks } from '@app/hooks/useProviderTasks';
import { descriptorFor, useProviderTypes } from '@app/hooks/useProviderTypes';
import { guardPage } from '@app/lib/utils/guardPage';
import type { ProviderType } from '@contract/providers';
import { Plug } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';

// ─── Provider order — the served type order ──────────────────────────────────

function sortProviders(providers: ProviderSummary[], typeOrder: ProviderType[]): ProviderSummary[] {
  return [...providers].sort((a, b) => {
    const ai = typeOrder.indexOf(a.type);
    const bi = typeOrder.indexOf(b.type);
    const aIdx = ai === -1 ? 999 : ai;
    const bIdx = bi === -1 ? 999 : bi;
    return aIdx !== bIdx ? aIdx - bIdx : a.name.localeCompare(b.name);
  });
}

// ─── Page guard ───────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const refusal = await guardPage(ctx);
  if (refusal) return refusal;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { providers, error, refresh, create, update, remove } = useProviderSettings();
  const { availability } = useProviderTasks();
  const { types } = useProviderTypes();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);

  const handleCreate = async (params: CreateProviderParams) => {
    const created = await create(params);
    setShowAddForm(false);
    setAddedName(created.name);
  };

  const typeOrder = (types ?? []).map((t) => t.type);

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar
          title="Providers"
          actions={
            <Button
              type="button"
              variant={showAddForm ? 'secondary' : 'primary'}
              size="sm"
              aria-expanded={showAddForm}
              onClick={() => setShowAddForm((v) => !v)}
            >
              {showAddForm ? 'Close form' : 'Add provider'}
            </Button>
          }
        />
      }
    >
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
        {showAddForm && (
          <AddProviderForm
            types={types}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {addedName && !showAddForm && (
          <p role="status" className="text-sm text-success">
            Added {addedName}. Open it to test the connection and enable tasks.
          </p>
        )}

        <AsyncBoundary
          data={providers}
          error={error}
          onRetry={() => refresh()}
          what="providers"
          loading={
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[72px]" />
              ))}
            </div>
          }
          isEmpty={(list) => list.length === 0}
          empty={
            showAddForm ? null : (
              <EmptyState
                icon={<Plug size={28} strokeWidth={1.25} aria-hidden="true" />}
                title="No providers configured"
                description="Connect your first provider to start building automations."
                action={{ label: 'Add provider', onClick: () => setShowAddForm(true) }}
              />
            )
          }
        >
          {(list) => {
            const sorted = sortProviders(list, typeOrder);
            return (
              <div className="space-y-2">
                {sorted.map((p, idx) => {
                  const prev = idx > 0 ? sorted[idx - 1] : null;
                  const showDivider = prev !== null && p.type !== prev.type;

                  return (
                    <div key={p.id}>
                      {showDivider && <div className="h-px bg-divider my-1" />}
                      <ProviderCard
                        provider={p}
                        typeDescriptor={descriptorFor(types, p.type)}
                        tasks={tasksForProvider(availability, p.id)}
                        onUpdate={(patch) => update(p.id, patch)}
                        onDelete={() => remove(p.id)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }}
        </AsyncBoundary>
      </div>
    </AppLayout>
  );
}
