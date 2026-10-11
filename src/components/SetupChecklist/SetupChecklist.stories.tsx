import type { Story } from '@ladle/react';
import SetupChecklist from './index';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-surface-bg p-6 max-w-4xl">{children}</div>
);

export const NoProviders: Story = () => (
  <Frame>
    <SetupChecklist state="no-providers" onCreateAutomation={() => alert('New automation')} />
  </Frame>
);

export const NoSource: Story = () => (
  <Frame>
    <SetupChecklist state="no-source" onCreateAutomation={() => alert('New automation')} />
  </Frame>
);

export const NoQuery: Story = () => (
  <Frame>
    <SetupChecklist state="no-query" onCreateAutomation={() => alert('New automation')} />
  </Frame>
);

export const NoAutomation: Story = () => (
  <Frame>
    <SetupChecklist state="no-automation" onCreateAutomation={() => alert('New automation')} />
  </Frame>
);
