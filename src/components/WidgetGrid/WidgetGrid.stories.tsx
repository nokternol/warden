import type { Story } from '@ladle/react';
import WidgetGrid from './index';

const DemoWidget = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-surface-panel rounded-lg p-6 border border-border border text-text-primary">
    {children}
  </div>
);

export const OneColumn: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={1}>
      <DemoWidget>Widget 1</DemoWidget>
      <DemoWidget>Widget 2</DemoWidget>
      <DemoWidget>Widget 3</DemoWidget>
    </WidgetGrid>
  </div>
);

export const TwoColumns: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={2}>
      <DemoWidget>Widget 1</DemoWidget>
      <DemoWidget>Widget 2</DemoWidget>
      <DemoWidget>Widget 3</DemoWidget>
      <DemoWidget>Widget 4</DemoWidget>
    </WidgetGrid>
  </div>
);

export const ThreeColumns: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={3}>
      <DemoWidget>Widget 1</DemoWidget>
      <DemoWidget>Widget 2</DemoWidget>
      <DemoWidget>Widget 3</DemoWidget>
      <DemoWidget>Widget 4</DemoWidget>
      <DemoWidget>Widget 5</DemoWidget>
      <DemoWidget>Widget 6</DemoWidget>
    </WidgetGrid>
  </div>
);

export const FourColumns: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={4}>
      <DemoWidget>Widget 1</DemoWidget>
      <DemoWidget>Widget 2</DemoWidget>
      <DemoWidget>Widget 3</DemoWidget>
      <DemoWidget>Widget 4</DemoWidget>
      <DemoWidget>Widget 5</DemoWidget>
      <DemoWidget>Widget 6</DemoWidget>
      <DemoWidget>Widget 7</DemoWidget>
      <DemoWidget>Widget 8</DemoWidget>
    </WidgetGrid>
  </div>
);

export const SmallGap: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={3} gap="sm">
      <DemoWidget>Small gap</DemoWidget>
      <DemoWidget>Small gap</DemoWidget>
      <DemoWidget>Small gap</DemoWidget>
    </WidgetGrid>
  </div>
);

export const MediumGap: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={3} gap="md">
      <DemoWidget>Medium gap (default)</DemoWidget>
      <DemoWidget>Medium gap (default)</DemoWidget>
      <DemoWidget>Medium gap (default)</DemoWidget>
    </WidgetGrid>
  </div>
);

export const LargeGap: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={3} gap="lg">
      <DemoWidget>Large gap</DemoWidget>
      <DemoWidget>Large gap</DemoWidget>
      <DemoWidget>Large gap</DemoWidget>
    </WidgetGrid>
  </div>
);

export const DashboardExample: Story = () => (
  <div className="bg-surface-bg p-8">
    <WidgetGrid columns={4}>
      <DemoWidget>
        <div className="text-sm text-text-muted mb-1">Active automations</div>
        <div className="text-3xl font-bold">142</div>
      </DemoWidget>
      <DemoWidget>
        <div className="text-sm text-text-muted mb-1">Queries</div>
        <div className="text-3xl font-bold">28</div>
      </DemoWidget>
      <DemoWidget>
        <div className="text-sm text-text-muted mb-1">System Status</div>
        <div className="text-3xl font-bold">Running</div>
      </DemoWidget>
      <DemoWidget>
        <div className="text-sm text-text-muted mb-1">Recent runs</div>
        <div className="text-3xl font-bold">5</div>
      </DemoWidget>
      <div className="col-span-1 md:col-span-2">
        <DemoWidget>
          <div className="text-lg font-semibold mb-2">Recent runs</div>
          <div className="text-text-muted">Automation list content...</div>
        </DemoWidget>
      </div>
      <div className="col-span-1 md:col-span-2 lg:col-span-2">
        <DemoWidget>
          <div className="text-lg font-semibold mb-2">Run history</div>
          <div className="text-text-muted">Run history content...</div>
        </DemoWidget>
      </div>
    </WidgetGrid>
  </div>
);
