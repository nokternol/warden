import Badge from '@app/components/Badge';
import { cn } from '@app/lib/utils/cn';
import type { SidebarItem as SidebarItemType } from '@app/types/navigation';
import Link from 'next/link';
import styles from './Sidebar.module.css';

interface SidebarItemProps {
  item: SidebarItemType;
  onClick?: (item: SidebarItemType) => void;
}

export default function SidebarItem({ item, onClick }: SidebarItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick(item);
    }
  };

  const activeStyles = item.active ? styles.itemActive : styles.itemInactive;

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      aria-current={item.active ? 'page' : undefined}
      className={cn(styles.itemBase, activeStyles)}
    >
      <div className={styles.itemIcon}>{item.icon}</div>
      <span className={styles.itemLabel}>{item.label}</span>
      {item.badge !== undefined && (
        <Badge size="sm" variant={item.active ? 'default' : 'primary'}>
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}
