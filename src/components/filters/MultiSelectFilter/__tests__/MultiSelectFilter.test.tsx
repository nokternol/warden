import '@testing-library/jest-dom/vitest';
import { render, screen, setupUser, within } from '@tests/helpers/component';
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

describe('MultiSelectFilter — grouped options', () => {
  const GROUPED = [
    { value: 10, label: 'Remux', group: 'Radarr 4K' },
    { value: 20, label: 'Kids', group: 'Radarr Standard' },
    { value: 11, label: 'HDR', group: 'Radarr 4K' },
  ];

  it('lists options under their group heading, groups in first-seen order', async () => {
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={GROUPED} selected={[]} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /tags/i }));
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Radarr 4K',
      'Radarr Standard',
    ]);
    expect(
      within(groups[0])
        .getAllByRole('menuitemcheckbox')
        .map((o) => o.textContent)
    ).toEqual(['Remux', 'HDR']);
  });
});

describe('MultiSelectFilter — keyboard', () => {
  const GROUPED = [
    { value: 10, label: 'Remux', group: 'Radarr 4K' },
    { value: 11, label: 'HDR', group: 'Radarr 4K' },
    { value: 20, label: 'Kids', group: 'Radarr Standard' },
  ];

  it('opens, moves between options across groups, toggles, and closes returning focus', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={GROUPED} selected={[]} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /tags/i });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Remux' })).toHaveFocus();

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Kids' })).toHaveFocus();

    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith([20]);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Kids' })).toHaveFocus();

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
