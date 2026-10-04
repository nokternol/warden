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

describe('MultiSelectFilter — boundaries', () => {
  it('renders nothing when there are no options', () => {
    const { container } = render(
      <MultiSelectFilter label="Tags" options={[]} selected={[]} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps string and numeric values as given, never coercing one to the other', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(
      <MultiSelectFilter
        label="Genre"
        options={[
          { value: 'Drama', label: 'Drama' },
          { value: 'Sci-Fi', label: 'Sci-Fi' },
        ]}
        selected={['Drama']}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /genre, 1 selected/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Sci-Fi' }));
    expect(onChange).toHaveBeenCalledWith(['Drama', 'Sci-Fi']);
  });

  it('closes when the user presses outside it', async () => {
    const user = setupUser();
    render(
      <div>
        <MultiSelectFilter label="Tags" options={TAGS} selected={[]} onChange={vi.fn()} />
        <p>elsewhere</p>
      </div>
    );
    await user.click(screen.getByRole('button', { name: /tags/i }));
    await user.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('MultiSelectFilter — clearing', () => {
  it('empties the selection with the clear action, by pointer', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={TAGS} selected={[1, 3]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /tags, 2 selected/i }));
    await user.click(screen.getByRole('menuitem', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('empties the selection with the clear action, by keyboard, returning focus to the trigger', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={TAGS} selected={[1]} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /tags, 1 selected/i });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /clear/i })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('offers no clear action when nothing is selected', async () => {
    const user = setupUser();
    render(<MultiSelectFilter label="Tags" options={TAGS} selected={[]} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /tags/i }));
    expect(screen.queryByRole('menuitem', { name: /clear/i })).not.toBeInTheDocument();
  });
});

describe('MultiSelectFilter — selections that span groups', () => {
  const GROUPED = [
    { value: 10, label: 'Remux', group: 'Radarr 4K' },
    { value: 11, label: 'HDR', group: 'Radarr 4K' },
    { value: 20, label: 'Kids', group: 'Radarr Standard' },
  ];
  const NOTE = 'Spans multiple instances.';

  const open = async (selected: number[]) => {
    const user = setupUser();
    render(
      <MultiSelectFilter
        label="Tags"
        options={GROUPED}
        selected={selected}
        onChange={vi.fn()}
        spanNote={NOTE}
      />
    );
    await user.click(screen.getByRole('button', { name: /tags/i }));
  };

  it('shows the caller note when the selection crosses groups', async () => {
    await open([10, 20]);
    expect(screen.getByRole('note')).toHaveTextContent(NOTE);
  });

  it('shows no note when the selection stays within one group', async () => {
    await open([10, 11]);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('MultiSelectFilter — footer stays in view', () => {
  const scrollingAncestor = (el: HTMLElement) => el.closest('.overflow-y-auto');

  it('keeps the note and the clear action outside the scrolling option list', async () => {
    const user = setupUser();
    render(
      <MultiSelectFilter
        label="Tags"
        options={[
          { value: 10, label: 'Remux', group: 'Radarr 4K' },
          { value: 20, label: 'Kids', group: 'Radarr Standard' },
        ]}
        selected={[10, 20]}
        onChange={vi.fn()}
        spanNote="Spans multiple instances."
      />
    );
    await user.click(screen.getByRole('button', { name: /tags/i }));
    expect(
      scrollingAncestor(screen.getByRole('menuitemcheckbox', { name: 'Remux' }))
    ).not.toBeNull();
    expect(scrollingAncestor(screen.getByRole('note'))).toBeNull();
    expect(scrollingAncestor(screen.getByRole('menuitem', { name: /clear/i }))).toBeNull();
  });
});

describe('MultiSelectFilter — focus leaving the menu', () => {
  const renderWithNeighbour = () =>
    render(
      <div>
        <MultiSelectFilter label="Tags" options={TAGS} selected={[]} onChange={vi.fn()} />
        <button type="button">next control</button>
      </div>
    );

  it('closes when Tab moves focus past the last item', async () => {
    const user = setupUser();
    renderWithNeighbour();
    await user.click(screen.getByRole('button', { name: /tags/i }));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'next control' })).toHaveFocus();
  });

  it('stays open while focus moves between the trigger and the items', async () => {
    const user = setupUser();
    renderWithNeighbour();
    const trigger = screen.getByRole('button', { name: /tags/i });
    await user.click(trigger);
    await user.keyboard('{ArrowUp}');
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: '4K' })).toHaveFocus();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
