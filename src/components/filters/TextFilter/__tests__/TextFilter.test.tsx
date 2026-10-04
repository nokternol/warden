import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@tests/helpers/component';
import { describe, expect, it, vi } from 'vitest';
import { TextFilter } from '../index';

describe('TextFilter', () => {
  it('shows its label as the accessible name and placeholder, and the current value', () => {
    render(<TextFilter label="Certification" value="PG-13" onChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Certification' });
    expect(input).toHaveAttribute('placeholder', 'Certification');
    expect(input).toHaveValue('PG-13');
  });

  it('is empty when there is no value', () => {
    render(<TextFilter label="Certification" value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Certification' })).toHaveValue('');
  });

  it('emits what the user types', () => {
    const onChange = vi.fn();
    render(<TextFilter label="Certification" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'R' } });
    expect(onChange).toHaveBeenCalledWith('R');
  });

  it('emits undefined when the user empties it, so the rule is unset rather than blank', () => {
    const onChange = vi.fn();
    render(<TextFilter label="Certification" value="R" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
