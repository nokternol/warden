import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MediaResetControl from '../index';

async function confirmAndType(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /reset media data/i }));
  await user.type(screen.getByRole('textbox', { name: /type reset to confirm/i }), 'RESET');
}

describe('MediaResetControl', () => {
  it('disables the confirm button until RESET is typed', async () => {
    const user = userEvent.setup();
    render(<MediaResetControl onReset={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /reset media data/i }));
    expect(screen.getByRole('button', { name: /reset media data/i })).toBeDisabled();
  });

  it('shows a success confirmation with the deleted count, then reverts', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn().mockResolvedValue({ deletedIdentities: 3210 });
    render(<MediaResetControl onReset={onReset} />);
    await confirmAndType(user);
    await user.click(screen.getByRole('button', { name: /reset media data/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('3,210 items cleared');
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows a recoverable error and keeps the panel open when reset fails', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn().mockRejectedValue(new Error('Failed to reset media data'));
    render(<MediaResetControl onReset={onReset} />);
    await confirmAndType(user);
    await user.click(screen.getByRole('button', { name: /reset media data/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to reset media data');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('MediaResetControl on open', () => {
  it('moves focus to the confirmation input and states the count it has', async () => {
    const user = userEvent.setup();
    render(<MediaResetControl onReset={vi.fn()} titleCount={1234} />);
    await user.click(screen.getByRole('button', { name: /reset media data/i }));
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByText(/1,234 titles/)).toBeInTheDocument();
  });
});
