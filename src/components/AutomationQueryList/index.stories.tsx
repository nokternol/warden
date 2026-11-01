import type { MediaQueryRecord } from '@app/hooks/useMediaQueries';
import type { Story } from '@ladle/react';
import { useState } from 'react';
import AutomationQueryList from './index';

const query = (id: number, name: string): MediaQueryRecord => ({
  id,
  name,
  contentType: 'movie',
  filters: [],
  health: { status: 'healthy', providerStatus: [], qualificationIssues: [] },
  createdAt: '2026-01-15T00:00:00Z',
});

const queries = [query(1, 'Stale Movies'), query(2, 'Kids titles'), query(3, 'Keep forever')];

type Held = React.ComponentProps<typeof AutomationQueryList>['automationQueries'];

function Stateful({ initial }: { initial: Held }) {
  const [held, setHeld] = useState(initial);
  return (
    <div className="p-6 max-w-xl">
      <AutomationQueryList automationQueries={held} queries={queries} onChange={setHeld} />
    </div>
  );
}

export const OneInclude: Story = () => (
  <Stateful initial={[{ queryId: 1, role: 'include', sortOrder: 0 }]} />
);

export const IncludeAndExclude: Story = () => (
  <Stateful
    initial={[
      { queryId: 1, role: 'include', sortOrder: 0 },
      { queryId: 3, role: 'exclude', sortOrder: 1 },
    ]}
  />
);
