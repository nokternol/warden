import { cn } from '@app/lib/utils/cn';
import type { SidebarItem as SidebarItemType } from '@app/types/navigation';
import type { HTMLAttributes } from 'react';
import styles from './Sidebar.module.css';
import SidebarItem from './SidebarItem';

interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
  items: SidebarItemType[];
  bottomItems?: SidebarItemType[];
  logo?: React.ReactNode;
  collapsed?: boolean;
  onItemClick?: (item: SidebarItemType) => void;
  onLogout?: () => void;
}

export default function Sidebar({
  items,
  bottomItems,
  logo,
  collapsed = false,
  onItemClick,
  onLogout,
  className = '',
  ...props
}: SidebarProps) {
  if (collapsed) {
    return null;
  }

  return (
    <div className={cn(styles.sidebar, className)} {...props}>
      {/* Logo/Header */}
      {logo && <div className={styles.logoWrapper}>{logo}</div>}

      {/* Main Navigation */}
      <nav aria-label="Main" className={styles.navMain}>
        {items.map((item) => (
          <SidebarItem key={item.id} item={item} onClick={onItemClick} />
        ))}
      </nav>

      {/* Bottom Section */}
      {bottomItems && bottomItems.length > 0 && (
        <>
          <div className={styles.divider} />
          <nav aria-label="Configuration" className={styles.navBottom}>
            {bottomItems.map((item) => (
              <SidebarItem key={item.id} item={item} onClick={onItemClick} />
            ))}
          </nav>
        </>
      )}

      {/* Logout */}
      {onLogout && (
        <>
          <div className={styles.divider} />
          <div className={styles.navBottom}>
            <button
              type="button"
              onClick={onLogout}
              className={cn(styles.itemBase, styles.itemInactive, 'w-full')}
            >
              <svg
                className={styles.itemIcon}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className={styles.itemLabel}>Sign out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
