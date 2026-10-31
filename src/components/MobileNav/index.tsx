import { resolveNavItems } from '@app/lib/navigation';
import { signOut } from '@app/lib/signOut';
import { cn } from '@app/lib/utils/cn';
import { LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const TAB = 'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 text-xs';
const MORE_ITEM =
  'flex w-full items-center gap-3 px-4 min-h-11 text-sm font-medium text-text-secondary hover:bg-surface-hover';

/**
 * The phone's navigation, from the same scope-filtered items as the sidebar: the main pages as
 * tabs, with the configuration pages and Sign out one tap away under More.
 */
export default function MobileNav() {
  const pathname = useRouter()?.pathname ?? '';
  const { items, bottomItems } = resolveNavItems(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const moreActive = bottomItems.some((item) => item.active);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  return (
    <nav
      aria-label="Mobile"
      className="fixed bottom-0 inset-x-0 md:hidden z-40 bg-surface-panel border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      {moreOpen && (
        <div className="border-b border-divider py-1">
          {bottomItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(MORE_ITEM, item.active && 'text-primary-text')}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
          <button
            type="button"
            className={MORE_ITEM}
            onClick={() => {
              setSignOutFailed(false);
              signOut().catch(() => setSignOutFailed(true));
            }}
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>Sign out</span>
          </button>
          {signOutFailed && (
            <p role="alert" className="px-4 py-2 text-xs text-danger-text">
              Couldn't sign out. Try again.
            </p>
          )}
        </div>
      )}
      <div className="flex">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cn(TAB, item.active ? 'text-primary-text' : 'text-text-muted')}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(TAB, moreActive ? 'text-primary-text' : 'text-text-muted')}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
