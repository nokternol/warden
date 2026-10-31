import { cn } from '@app/lib/utils/cn';
import { type HTMLAttributes, createContext, useRef } from 'react';
import styles from './AppLayout.module.css';

export const ScrollContainerContext = createContext<React.RefObject<HTMLElement | null>>({
  current: null,
});

interface AppLayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topBar?: React.ReactNode;
  mobileNav?: React.ReactNode;
}

export default function AppLayout({
  children,
  sidebar,
  topBar,
  mobileNav,
  className = '',
  ...props
}: AppLayoutProps) {
  const mainRef = useRef<HTMLElement>(null);

  return (
    <ScrollContainerContext.Provider value={mainRef}>
      <div className={cn(styles.container, className)} {...props}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-sm focus:bg-surface-elevated focus:text-text-primary"
        >
          Skip to content
        </a>

        {/* Sidebar */}
        {sidebar && <aside className={styles.sidebarWrapper}>{sidebar}</aside>}

        {/* Main Content */}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className={cn(styles.mainContent, mobileNav && 'pb-16 md:pb-0')}
        >
          {topBar}
          {children}
        </main>

        {/* Mobile bottom navigation bar — fixed, hidden on md+ */}
        {mobileNav && (
          <div className="fixed bottom-0 left-0 right-0 md:hidden z-40 bg-surface-panel border-t border-border">
            {mobileNav}
          </div>
        )}
      </div>
    </ScrollContainerContext.Provider>
  );
}
