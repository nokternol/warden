import type { ProviderSummary } from '@app/hooks/useProviderSettings';
import type { ProviderTaskDescriptor } from '@app/hooks/useProviderTasks';
import type { ProviderTypeDescriptor } from '@contract/providers';
import type { Story } from '@ladle/react';
import { useEffect, useRef } from 'react';
import ProviderCard from './index';

const provider: ProviderSummary = {
  id: 1,
  type: 'RADARR',
  name: 'Radarr Main',
  url: 'http://localhost:7878/api/v3',
  apiKey: '***',
  settings: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const radarrType: ProviderTypeDescriptor = {
  type: 'RADARR',
  label: 'Radarr',
  apiPath: '/api/v3',
  capabilities: ['Movie library', 'Quality profiles', 'Tags'],
};

const overseerrType: ProviderTypeDescriptor = {
  type: 'OVERSEERR',
  label: 'Overseerr',
  apiPath: '',
  capabilities: ['Request queue'],
};

const tasks: ProviderTaskDescriptor[] = [
  { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
  { id: 'triggerSearch', label: 'Trigger download search', destructive: false, enabled: false },
  { id: 'deleteMovieWithFiles', label: 'Delete movie + files', destructive: true, enabled: false },
];

const noop = () => Promise.resolve(undefined);

/** Opens the card on mount so the task surface is visible without interaction. */
function Expanded({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.click();
  }, []);
  return <div ref={ref}>{children}</div>;
}

export const Collapsed: Story = () => (
  <div className="max-w-3xl p-6">
    <ProviderCard
      provider={provider}
      providerType={radarrType}
      tasks={tasks}
      onUpdate={noop}
      onDelete={() => {}}
    />
  </div>
);

export const ExpandedWithTasks: Story = () => (
  <div className="max-w-3xl p-6">
    <Expanded>
      <ProviderCard
        provider={provider}
        providerType={radarrType}
        tasks={tasks}
        onUpdate={noop}
        onDelete={() => {}}
      />
    </Expanded>
  </div>
);

export const ExpandedNoTasks: Story = () => (
  <div className="max-w-3xl p-6">
    <Expanded>
      <ProviderCard
        provider={{
          ...provider,
          type: 'OVERSEERR',
          name: 'Overseerr',
          url: 'http://localhost:5055',
        }}
        providerType={overseerrType}
        tasks={[]}
        onUpdate={noop}
        onDelete={() => {}}
      />
    </Expanded>
  </div>
);
