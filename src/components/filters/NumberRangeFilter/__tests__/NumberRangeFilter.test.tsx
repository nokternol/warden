import '@testing-library/jest-dom/vitest';
import { NumberRangeFilter } from '@app/components/MediaFilterBar';
import { fireEvent, render, screen, setupUser } from '@tests/helpers/component';
import { describe, expect, it, vi } from 'vitest';

const setup = (props: Partial<Parameters<typeof NumberRangeFilter>[0]> = {}) => {
  const onChangeMin = vi.fn();
  const onChangeMax = vi.fn();
  const utils = render(
    <NumberRangeFilter
      label="Size"
      min={undefined}
      max={undefined}
      onChangeMin={onChangeMin}
      onChangeMax={onChangeMax}
      {...props}
    />
  );
  return { onChangeMin, onChangeMax, ...utils };
};

const open = async (user: ReturnType<typeof setupUser>) =>
  user.click(screen.getByRole('button', { name: /size filter/i }));

describe('NumberRangeFilter — trigger', () => {
  it('is named by its label while no bound is set', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Size filter' });
    expect(trigger).toHaveTextContent('Size');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the active range, with an open end as "any" for assistive tech', () => {
    setup({ min: 5, max: undefined });
    const trigger = screen.getByRole('button', { name: 'Size filter: 5 to any, click to change' });
    expect(trigger).toHaveTextContent('5–…');
  });
});

describe('NumberRangeFilter — editing', () => {
  it('opens a dialog with the current bounds, focusing From', async () => {
    const user = setupUser();
    setup({ min: 5, max: 9 });
    await open(user);
    expect(screen.getByRole('dialog', { name: 'Size range filter' })).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveValue(5);
    expect(screen.getByLabelText('To')).toHaveValue(9);
    await vi.waitFor(() => expect(screen.getByLabelText('From')).toHaveFocus());
  });

  it('uses the data range as placeholders, or Min and Max without one', async () => {
    const user = setupUser();
    const { unmount } = setup({ dataMin: 1, dataMax: 100 });
    await open(user);
    expect(screen.getByLabelText('From')).toHaveAttribute('placeholder', '1');
    expect(screen.getByLabelText('To')).toHaveAttribute('placeholder', '100');
    unmount();
    setup();
    await open(user);
    expect(screen.getByLabelText('From')).toHaveAttribute('placeholder', 'Min');
    expect(screen.getByLabelText('To')).toHaveAttribute('placeholder', 'Max');
  });

  it('applies both bounds as numbers, an empty one as undefined, then closes', async () => {
    const user = setupUser();
    const { onChangeMin, onChangeMax } = setup();
    await open(user);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2.5' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChangeMin).toHaveBeenCalledWith(2.5);
    expect(onChangeMax).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /size filter/i })).toHaveFocus();
  });

  it('applies on Enter', async () => {
    const user = setupUser();
    const { onChangeMax } = setup();
    await open(user);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '8' } });
    await user.type(screen.getByLabelText('To'), '{Enter}');
    expect(onChangeMax).toHaveBeenCalledWith(8);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('discards the draft on Escape', async () => {
    const user = setupUser();
    const { onChangeMin } = setup();
    await open(user);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '3' } });
    await user.type(screen.getByLabelText('From'), '{Escape}');
    expect(onChangeMin).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('applies the draft when the user presses outside', async () => {
    const user = setupUser();
    const { onChangeMin } = setup();
    await open(user);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '4' } });
    fireEvent.mouseDown(document.body);
    expect(onChangeMin).toHaveBeenCalledWith(4);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears both bounds', async () => {
    const user = setupUser();
    const { onChangeMin, onChangeMax } = setup({ min: 1, max: 2 });
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChangeMin).toHaveBeenCalledWith(undefined);
    expect(onChangeMax).toHaveBeenCalledWith(undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables Clear while there is nothing to clear', async () => {
    const user = setupUser();
    setup();
    await open(user);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
