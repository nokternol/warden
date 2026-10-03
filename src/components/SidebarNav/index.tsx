import { WardenLogo } from '@app/components/Logo';
import Sidebar from '@app/components/Sidebar';
import { api } from '@app/lib/api/client';
import { resolveNavItems } from '@app/lib/navigation';
import { useRouter } from 'next/router';

const logo = (
  <div className="flex items-center gap-2.5">
    <WardenLogo className="w-7 h-7" />
    <span className="text-base font-semibold text-text-primary tracking-tight">Warden</span>
  </div>
);

export default function SidebarNav() {
  const { pathname } = useRouter();
  const { items, bottomItems } = resolveNavItems(pathname);

  const handleLogout = async () => {
    await api.auth.logout();
    window.location.href = '/login';
  };

  return <Sidebar items={items} bottomItems={bottomItems} logo={logo} onLogout={handleLogout} />;
}
