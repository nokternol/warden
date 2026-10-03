import type { Story } from '@ladle/react';
import Badge from './index';

export const Default: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge>Default</Badge>
  </div>
);

export const Success: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge variant="success">Active</Badge>
  </div>
);

export const Warning: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge variant="warning">Pending</Badge>
  </div>
);

export const ErrorVariant: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge variant="error">Failed</Badge>
  </div>
);

export const Info: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge variant="info">Info</Badge>
  </div>
);

export const Primary: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge variant="primary">New</Badge>
  </div>
);

export const SmallSize: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge size="sm">Small</Badge>
  </div>
);

export const MediumSize: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge size="md">Medium</Badge>
  </div>
);

export const LargeSize: Story = () => (
  <div className="bg-surface-bg p-8">
    <Badge size="lg">Large</Badge>
  </div>
);

export const AllVariants: Story = () => (
  <div className="bg-surface-bg p-8 flex flex-wrap gap-3">
    <Badge variant="default">Default</Badge>
    <Badge variant="success">Success</Badge>
    <Badge variant="warning">Warning</Badge>
    <Badge variant="error">Error</Badge>
    <Badge variant="info">Info</Badge>
    <Badge variant="primary">Primary</Badge>
  </div>
);

export const AllSizes: Story = () => (
  <div className="bg-surface-bg p-8 flex flex-wrap items-center gap-3">
    <Badge size="sm" variant="primary">
      Small
    </Badge>
    <Badge size="md" variant="primary">
      Medium
    </Badge>
    <Badge size="lg" variant="primary">
      Large
    </Badge>
  </div>
);

export const WithNumbers: Story = () => (
  <div className="bg-surface-bg p-8 flex flex-wrap gap-3">
    <Badge variant="primary">5</Badge>
    <Badge variant="warning">12</Badge>
    <Badge variant="error">99+</Badge>
    <Badge variant="success">142</Badge>
  </div>
);

export const StatusIndicators: Story = () => (
  <div className="bg-surface-bg p-8 space-y-4">
    <div className="flex items-center gap-2">
      <span className="text-text-primary">Run status:</span>
      <Badge variant="success">Completed</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-text-primary">Build Status:</span>
      <Badge variant="warning">In Progress</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-text-primary">System Status:</span>
      <Badge variant="error">Down</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-text-primary">New Features:</span>
      <Badge variant="primary">3</Badge>
    </div>
  </div>
);
