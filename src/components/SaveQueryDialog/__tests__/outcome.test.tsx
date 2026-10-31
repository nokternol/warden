import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SaveQueryDialog } from '../index';

describe('SaveQueryDialog', () => {
  const save = async (onSave: (name: string) => Promise<unknown>, onClose = vi.fn()) => {
    const user = userEvent.setup();
    render(<SaveQueryDialog open onClose={onClose} onSave={onSave} />);
    await user.type(screen.getByLabelText('Query name', { selector: 'input' }), 'Old');
    await user.click(screen.getByRole('button', { name: 'Save query', hidden: true }));
    return onClose;
  };

  it('stays open with the name and an alert when the save fails', async () => {
    const onClose = await save(vi.fn().mockRejectedValue(new Error('Name taken')));
    expect(await screen.findByText('Name taken')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Query name', { selector: 'input' })).toHaveValue('Old');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('waits for the outcome before closing', async () => {
    let finish = () => {};
    const onClose = await save(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    finish();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
