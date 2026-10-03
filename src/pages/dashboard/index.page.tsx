import AppLayout from '@app/components/AppLayout';
import { DashboardContent } from '@app/components/DashboardContent';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useAutomations } from '@app/hooks/useAutomations';
import { requireAuth } from '@app/lib/utils/requireAuth';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

export default function DashboardPage() {
  const { automations } = useAutomations();
  const router = useRouter();

  return (
    <AppLayout
      sidebar={<SidebarNav />}
      topBar={
        <TopBar
          title="Dashboard"
          actions={
            <button
              type="button"
              onClick={() => void router.push('/automations')}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg"
            >
              + New automation
            </button>
          }
        />
      }
    >
      <DashboardContent automations={automations} />
    </AppLayout>
  );
}
