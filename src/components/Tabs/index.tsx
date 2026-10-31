import { cn } from '@app/lib/utils/cn';
import { useRef } from 'react';

export interface Tab<T extends string> {
  value: T;
  label: string;
  count?: number;
  loading?: boolean;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;

    if (next !== null) {
      e.preventDefault();
      onChange(tabs[next].value);
      buttonRefs.current[next]?.focus();
    }
  };

  return (
    <div className={cn('flex items-center gap-1', className)} role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          type="button"
          id={`tab-${tab.value}`}
          role="tab"
          aria-selected={active === tab.value}
          aria-controls={`tabpanel-${tab.value}`}
          tabIndex={active === tab.value ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onClick={() => onChange(tab.value)}
          className={cn(
            'px-3 py-1.5 rounded-sm text-sm font-medium transition-colors',
            active === tab.value
              ? 'bg-primary text-on-primary'
              : 'text-text-primary hover:bg-surface-hover'
          )}
        >
          {tab.label}
          {!tab.loading && tab.count !== undefined && (
            <span
              className={cn(
                'ml-1.5 text-xs',
                active === tab.value ? 'opacity-80' : 'text-text-muted'
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
