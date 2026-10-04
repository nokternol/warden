import AddProviderForm from '@app/components/AddProviderForm';
import AppLayout from '@app/components/AppLayout';
import Button from '@app/components/Button';
import ProviderCard from '@app/components/ProviderCard';
import SidebarNav from '@app/components/SidebarNav';
import { Skeleton } from '@app/components/Skeleton';
import TopBar from '@app/components/TopBar';
import type { CreateProviderParams, ProviderSummary } from '@app/hooks/useProviderSettings';
import { useProviderSettings } from '@app/hooks/useProviderSettings';
import { tasksForProvider, useProviderTasks } from '@app/hooks/useProviderTasks';
import { descriptorFor, useProviderTypes } from '@app/hooks/useProviderTypes';
import { requireAuth } from '@app/lib/utils/requireAuth';
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

// ─── Auth guard ───────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { providers, isLoading, create, update, remove } = useProviderSettings();
  const { availability } = useProviderTasks();
  const { types } = useProviderTypes();
  const [showAddForm, setShowAddForm] = useState(false);

  const handleCreate = async (params: CreateProviderParams) => {
    await create(params);
    setShowAddForm(false);
  };

  const typeOrder = (types ?? []).map((t) => t.type);
  const sorted = providers ? sortProviders(providers, typeOrder) : [];

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar
          title="Providers"
          breadcrumbs={[{ label: 'Settings' }, { label: 'Providers' }]}
          actions={
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setShowAddForm((v) => !v)}
            >
              Add provider
            </Button>
          }
        />
      }
    >
      <div className="p-6 space-y-4 max-w-3xl">
        {showAddForm && (
          <AddProviderForm
            types={types}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        )}

        {!isLoading && sorted.length === 0 && !showAddForm && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Plug size={32} strokeWidth={1.25} className="text-text-muted mb-4" />
            <p className="text-sm font-medium text-text-primary mb-1">No providers configured</p>
            <p className="text-xs text-text-muted max-w-xs">
              Connect your first provider to start building automations.
            </p>
          </div>
        )}

        {!isLoading && sorted.length > 0 && (
          <div className="space-y-2">
            {sorted.map((p, idx) => {
              const prev = idx > 0 ? sorted[idx - 1] : null;
              const typeGroup = (t: ProviderType) => typeOrder.indexOf(t);
              const showDivider = prev !== null && typeGroup(p.type) !== typeGroup(prev.type);

              return (
                <div key={p.id}>
                  {showDivider && <div className="h-px bg-border/40 my-1" />}
                  <ProviderCard
                    provider={p}
                    providerType={descriptorFor(types, p.type)}
                    tasks={tasksForProvider(availability, p.id)}
                    onUpdate={(patch) => update(p.id, patch)}
                    onDelete={() => remove(p.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
