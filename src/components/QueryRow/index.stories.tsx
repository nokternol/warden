import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import type { Story } from '@ladle/react';
import QueryRow from './index';

const query: MediaQueryRecord = {
  id: 1,
  name: 'Stale Movies',
  contentType: 'movie',
  filters: [{ ruleKey: 'year', value: { max: 2020 } }],
  health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
  createdAt: '2026-01-15T00:00:00Z',
};

const noop = () => {};

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 max-w-3xl">
    <div className="rounded-lg border border-border bg-surface-panel">{children}</div>
  </div>
);

export const Healthy: Story = () => (
  <Panel>
    <QueryRow query={query} onLoad={noop} onDelete={noop} />
  </Panel>
);

export const Degraded: Story = () => (
  <Panel>
    <QueryRow
      query={{
        ...query,
        health: {
          status: 'degraded',
          providerStatus: [
            {
              providerType: 'TAUTULLI',
              required: false,
              configured: false,
              affectedFilterKeys: ['watched'],
            },
          ],
          qualificationIssues: [],
        },
      }}
      onLoad={noop}
      onDelete={noop}
    />
  </Panel>
);

export const FilterNoLongerOffered: Story = () => (
  <Panel>
    <QueryRow
      query={{ ...query, filters: [{ ruleKey: 'noLongerOffered', value: 'x' }] }}
      onLoad={noop}
      onDelete={noop}
    />
  </Panel>
);
