import MobileNav from '@app/components/MobileNav';
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
}

export default function AppLayout({
  children,
  sidebar,
  topBar,
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
        <main ref={mainRef} id="main-content" tabIndex={-1} className={styles.mainContent}>
          {topBar}
          {children}
        </main>

        <MobileNav />
      </div>
    </ScrollContainerContext.Provider>
  );
}
