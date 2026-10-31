import { cn } from '@app/lib/utils/cn';
import type React from 'react';
import { createContext, useContext } from 'react';
import Badge from '../Badge';
import { MediaPoster } from '../MediaPoster';
import { Skeleton } from '../Skeleton';
import styles from './MediaCard.module.css';

interface MediaCardContextType {
  id: string;
}

const MediaCardContext = createContext<MediaCardContextType | null>(null);

export function useMediaCard() {
  const context = useContext(MediaCardContext);
  if (!context) throw new Error('useMediaCard must be used within MediaCard');
  return context;
}

export interface MediaCardRootProps {
  id: string;
  onClick?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

const Root = ({
  id,
  children,
  onClick,
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: MediaCardRootProps) => {
  const commonProps = {
    className: cn(styles.card, onClick && styles.interactive, className),
    'aria-label': ariaLabel,
    'data-testid': testId ?? 'media-card',
  };

  return (
    <MediaCardContext.Provider value={{ id }}>
      {onClick ? (
        <button type="button" {...commonProps} onClick={() => onClick(id)}>
          {children}
        </button>
      ) : (
        <div {...commonProps}>{children}</div>
      )}
    </MediaCardContext.Provider>
  );
};

const Poster = ({ src, alt, className }: { src?: string; alt: string; className?: string }) => {
  return (
    <div className={styles.posterWrapper}>
      <MediaPoster src={src} alt={alt} className={cn(styles.poster, className)} />
    </div>
  );
};

const Title = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return (
    <h3
      className={cn(styles.title, className)}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </h3>
  );
};

const Year = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  if (!children) return null;
  return <span className={cn(styles.year, className)}>{children}</span>;
};

const StatusBadge = ({
  status,
  className,
}: { status?: 'monitored' | 'missing' | 'downloaded'; className?: string }) => {
  if (!status) return null;
  const variantMap = {
    monitored: 'primary',
    missing: 'warning',
    downloaded: 'success',
  } as const;

  return (
    <div className={cn(styles.badgeWrapper, className)}>
      <Badge variant={variantMap[status]} size="sm">
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    </div>
  );
};

const Content = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn(styles.contentWrapper, className)}>{children}</div>;
};

const SkeletonCard = () => (
  <div className={styles.card} data-testid="media-card-skeleton">
    <div className={styles.posterWrapper}>
      <Skeleton className="w-full aspect-[2/3] rounded-md" />
    </div>
    <div className={cn(styles.contentWrapper, 'gap-1 pt-1')}>
      <Skeleton className="h-3 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
    </div>
  </div>
);

export const MediaCard = Object.assign(Root, {
  Poster,
  Title,
  Year,
  StatusBadge,
  Content,
  Skeleton: SkeletonCard,
});

export default MediaCard;
