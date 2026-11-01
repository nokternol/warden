import type { Story } from '@ladle/react';
import { PlexIcon, WardenLogo } from './index';

export const Default: Story = () => (
  <div className="bg-surface-bg p-12 flex items-center gap-8">
    <WardenLogo />
  </div>
);

export const Sizes: Story = () => (
  <div className="bg-surface-bg p-12 flex items-end gap-8">
    <WardenLogo className="w-8 h-8" />
    <WardenLogo className="w-12 h-12" />
    <WardenLogo className="w-16 h-16" />
    <WardenLogo className="w-24 h-24" />
    <WardenLogo className="w-32 h-32" />
  </div>
);

export const LoaderMode: Story = () => (
  <div className="bg-surface-bg p-12 flex items-center gap-8">
    <WardenLogo isLoader={true} className="w-16 h-16" />
    <p className="text-xs text-text-muted font-mono">isLoader=true (spins, no glow)</p>
  </div>
);

export const WithGlow: Story = () => (
  <div className="bg-surface-bg p-12 flex items-center gap-8">
    <WardenLogo isLoader={false} className="w-24 h-24" />
    <p className="text-xs text-text-muted font-mono">isLoader=false (glow visible)</p>
  </div>
);

export const CustomId: Story = () => (
  <div className="bg-surface-bg p-12 flex items-center gap-8">
    <WardenLogo id="custom-logo" />
  </div>
);

export const PlexIconDefault: Story = () => (
  <div className="bg-surface-bg p-12 flex items-center gap-4">
    <PlexIcon />
    <PlexIcon className="w-8 h-8 text-yellow-500" />
    <PlexIcon className="w-12 h-12 text-primary-text" />
  </div>
);
