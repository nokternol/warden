import type { CopyFreshness } from '@contract/media';
import type { Story } from '@ladle/react';
import CopyAsOf from './index';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 max-w-3xl space-y-4">{children}</div>
);

const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const fresh: CopyFreshness = { asOf: at('2026-11-15T14:03:00Z'), stale: [] };

export const Fresh: Story = () => (
  <Frame>
    <CopyAsOf freshness={fresh} />
  </Frame>
);

export const AProviderFailed: Story = () => (
  <Frame>
    <CopyAsOf
      freshness={{
        asOf: at('2026-11-15T13:00:00Z'),
        stale: [{ provider: 'Radarr 4K', kind: 'catalog', failed: true }],
      }}
    />
  </Frame>
);

export const FailedAndNotRefreshed: Story = () => (
  <Frame>
    <CopyAsOf
      freshness={{
        asOf: at('2026-11-14T22:00:00Z'),
        stale: [
          { provider: 'Tautulli', kind: 'facts', failed: true },
          { provider: 'Seerr', kind: 'facts', failed: false },
        ],
      }}
    />
  </Frame>
);

export const NeverRefreshed: Story = () => (
  <Frame>
    <CopyAsOf
      freshness={{ asOf: null, stale: [{ provider: 'Radarr', kind: 'catalog', failed: false }] }}
    />
  </Frame>
);
