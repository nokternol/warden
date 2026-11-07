import type { AutomationReadiness } from '@contract/automations';
import {
  type FindingDescription,
  type ReadinessFinding,
  describeFinding,
} from '@contract/readiness';
import type { Story } from '@ladle/react';
import ReadinessBlocks from './ReadinessBlocks';
import RunCheck from './RunCheck';

const finding = (description: FindingDescription): ReadinessFinding => ({
  id: JSON.stringify(description),
  kind: description.kind,
  providerIds: [],
  ...describeFinding(description),
});

const noData = finding({
  kind: 'no-data',
  ruleLabel: 'Seerr request status',
  contentType: 'movie',
});
const incomplete = finding({ kind: 'data-incomplete', ruleLabel: 'Watched' });
const signedOff = finding({ kind: 'no-data', ruleLabel: 'Seerr has issue', contentType: 'movie' });

const readiness = (over: Partial<AutomationReadiness>): AutomationReadiness => ({
  schedule: 'runs',
  runNow: 'runs',
  blocks: { needsFix: [], awaitingSignOff: [], signedOff: [] },
  problems: [],
  count: 214,
  contentType: 'movie',
  ...over,
});

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 max-w-4xl">{children}</div>
);
const noop = () => {};

export const BlocksMixed: Story = () => (
  <Frame>
    <ReadinessBlocks
      readiness={readiness({
        blocks: { needsFix: [incomplete], awaitingSignOff: [noData], signedOff: [signedOff] },
      })}
      onSignOff={noop}
    />
  </Frame>
);

export const BlocksAutomationProblem: Story = () => (
  <Frame>
    <ReadinessBlocks
      readiness={readiness({
        problems: ["Radarr instance 1, this automation's provider, is not an active provider"],
      })}
      onSignOff={noop}
    />
  </Frame>
);

export const RunCheckCounted: Story = () => (
  <Frame>
    <RunCheck
      readiness={readiness({})}
      taskLabel="Delete movie + files"
      destructive
      onConfirm={noop}
      onCancel={noop}
      onRetry={noop}
    />
  </Frame>
);

export const RunCheckAsks: Story = () => (
  <Frame>
    <RunCheck
      readiness={readiness({
        schedule: 'blocked',
        runNow: 'asks',
        blocks: { needsFix: [], awaitingSignOff: [noData], signedOff: [] },
      })}
      taskLabel="Delete movie + files"
      destructive
      onConfirm={noop}
      onCancel={noop}
      onRetry={noop}
    />
  </Frame>
);

export const RunCheckStops: Story = () => (
  <Frame>
    <RunCheck
      readiness={readiness({
        schedule: 'blocked',
        runNow: 'stops',
        blocks: { needsFix: [incomplete], awaitingSignOff: [], signedOff: [] },
      })}
      taskLabel="Unmonitor movie"
      destructive={false}
      onConfirm={noop}
      onCancel={noop}
      onRetry={noop}
    />
  </Frame>
);

export const RunCheckCountFailed: Story = () => (
  <Frame>
    <RunCheck
      readiness={readiness({ count: null, countError: 'Radarr could not be reached' })}
      taskLabel="Delete movie + files"
      destructive
      onConfirm={noop}
      onCancel={noop}
      onRetry={noop}
    />
  </Frame>
);
