import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import {
  type FindingDescription,
  type ReadinessFinding,
  describeFinding,
} from '@contract/readiness';
import type { Story } from '@ladle/react';
import QueryRow from './index';

const query: MediaQueryRecord = {
  id: 1,
  name: 'Stale Movies',
  contentType: 'movie',
  filters: [{ ruleKey: 'year', value: { max: 2020 } }],
  health: {
    findings: [],
    queryList: 'clear',
  },
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

const finding = (description: FindingDescription): ReadinessFinding => ({
  id: JSON.stringify(description),
  kind: description.kind,
  providerIds: [],
  ...describeFinding(description),
});

export const Broken: Story = () => (
  <Panel>
    <QueryRow
      query={{
        ...query,
        health: {
          findings: [
            finding({
              kind: 'no-provider',
              ruleLabel: 'Watched',
              producerLabels: ['Tautulli', 'Plex', 'Jellyfin'],
              offered: true,
            }),
          ],
          queryList: 'broken',
        },
      }}
      onLoad={noop}
      onDelete={noop}
    />
  </Panel>
);

export const CheckData: Story = () => (
  <Panel>
    <QueryRow
      query={{
        ...query,
        health: {
          findings: [
            finding({ kind: 'no-data', ruleLabel: 'Seerr request status', contentType: 'movie' }),
          ],
          queryList: 'checkData',
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
