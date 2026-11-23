import {
  type FindingDescription,
  type ReadinessFinding,
  describeFinding,
} from '@contract/readiness';
import type { Story } from '@ladle/react';
import ReadinessNotice from './index';

const finding = (description: FindingDescription): ReadinessFinding => ({
  id: JSON.stringify(description),
  kind: description.kind,
  providerIds: [],
  ...describeFinding(description),
});

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 max-w-3xl">{children}</div>
);

export const NeedsFix: Story = () => (
  <Frame>
    <ReadinessNotice
      findings={[
        finding({
          kind: 'no-provider',
          ruleLabel: 'Watched',
          supplierLabels: ['Tautulli', 'Plex', 'Jellyfin'],
          offered: true,
        }),
      ]}
    />
  </Frame>
);

export const NoData: Story = () => (
  <Frame>
    <ReadinessNotice
      findings={[finding({ kind: 'no-data', ruleLabel: 'Request status', contentType: 'movie' })]}
    />
  </Frame>
);

/** The data-incomplete finding is informational: the notice leaves it to the As of line. */
export const Mixed: Story = () => (
  <Frame>
    <ReadinessNotice
      findings={[
        finding({ kind: 'data-incomplete', ruleLabel: 'Watched' }),
        finding({
          kind: 'inactive-instance',
          ruleLabel: 'Tags',
          instance: { id: 3, typeLabel: 'Radarr' },
        }),
        finding({ kind: 'no-data', ruleLabel: 'Request status', contentType: 'movie' }),
      ]}
    />
  </Frame>
);

export const None: Story = () => (
  <Frame>
    <ReadinessNotice findings={[]} />
    <p className="text-sm text-text-muted">Nothing renders above this line.</p>
  </Frame>
);
