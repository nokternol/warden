import '@testing-library/jest-dom/vitest';
import { render, screen, setupUser } from '@tests/helpers/component';
import { describe, expect, it, vi } from 'vitest';
import { MultiSelectFilter } from '../index';

const TAGS = [
  { value: 1, label: '4K' },
  { value: 2, label: 'Remux' },
  { value: 3, label: 'Kids' },
];

describe('MultiSelectFilter — selecting', () => {
  it('emits the selection including an option the user chooses', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={TAGS} selected={[1]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /tags/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Remux' }));
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });
});

describe('MultiSelectFilter — deselecting', () => {
  it('emits the selection without an option the user chooses again', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={TAGS} selected={[1, 2]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /tags/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: '4K' }));
    expect(onChange).toHaveBeenCalledWith([2]);
  });
});
