import type { Story } from '@ladle/react';
import StatCard from './index';

const TaskIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
    />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

export const BasicNumber: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard value={142} label="Active automations" />
  </div>
);

export const WithIcon: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard value={142} label="Active automations" icon={<TaskIcon />} />
  </div>
);

export const WithTrendUp: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard
      value={142}
      label="Active automations"
      icon={<TaskIcon />}
      trend={{ value: 12, direction: 'up' }}
    />
  </div>
);

export const WithTrendDown: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard
      value={89}
      label="Pending Items"
      icon={<ChartIcon />}
      trend={{ value: 8, direction: 'down' }}
    />
  </div>
);

export const WithSubtitle: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard value={28} label="Queries" icon={<FolderIcon />} subtitle="Last updated 5 mins ago" />
  </div>
);

export const StringValue: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard value="Running" label="System Status" subtitle="All providers operational" />
  </div>
);

export const AllFeatures: Story = () => (
  <div className="bg-surface-bg p-8">
    <StatCard
      value={1248}
      label="Total Items"
      icon={<ChartIcon />}
      trend={{ value: 23, direction: 'up' }}
      subtitle="Updated just now"
    />
  </div>
);

export const GridExample: Story = () => (
  <div className="bg-surface-bg p-8">
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
      }}
    >
      <StatCard
        value={142}
        label="Active automations"
        icon={<TaskIcon />}
        trend={{ value: 12, direction: 'up' }}
      />
      <StatCard value={28} label="Queries" icon={<FolderIcon />} />
      <StatCard value="Running" label="System Status" subtitle="All systems operational" />
      <StatCard
        value={1248}
        label="Total Items"
        icon={<ChartIcon />}
        trend={{ value: 8, direction: 'down' }}
      />
    </div>
  </div>
);
