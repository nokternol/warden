import type { Story } from '@ladle/react';
import { SaveQueryDialog } from './index';

export const Open: Story = () => (
  <SaveQueryDialog open onClose={() => {}} onSave={async () => {}} />
);

export const SaveFails: Story = () => (
  <SaveQueryDialog
    open
    onClose={() => {}}
    onSave={async () => {
      throw new Error('The name is already in use');
    }}
  />
);
