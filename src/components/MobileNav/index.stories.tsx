import type { Story } from '@ladle/react';
import MobileNav from './index';

/** View at a phone width: the bar is hidden from md up. */
export const Default: Story = () => (
  <div className="h-96">
    <MobileNav />
  </div>
);
