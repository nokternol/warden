import Button from '@app/components/Button';
import { cn } from '@app/lib/utils/cn';
import type { HTMLAttributes } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** The next step: a link when given `href`, otherwise a button. */
  action?: { label: string; onClick?: () => void; href?: string };
}

/** The one empty-state pattern: why there is nothing here, and what to do about it. */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(styles.container, className)} {...props}>
      {icon && <div className={styles.iconWrapper}>{icon}</div>}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action?.href && (
        <a href={action.href} className={styles.link}>
          {action.label}
        </a>
      )}
      {action && !action.href && (
        <Button type="button" variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
