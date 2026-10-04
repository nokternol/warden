import '@testing-library/jest-dom/vitest';
import { MobileYearInputs } from '@app/components/MediaFilterBar';
import { fireEvent, render, screen } from '@tests/helpers/component';
import { describe, expect, it, vi } from 'vitest';

const setup = (props: Partial<Parameters<typeof MobileYearInputs>[0]> = {}) => {
  const setYearMin = vi.fn();
  const setYearMax = vi.fn();
  render(
    <MobileYearInputs
      yearMin={undefined}
      yearMax={undefined}
      globalMin={1990}
      globalMax={2024}
      setYearMin={setYearMin}
      setYearMax={setYearMax}
      {...props}
    />
  );
  return { setYearMin, setYearMax };
};

describe('MobileYearInputs', () => {
  it('offers the data range as placeholders when nothing is set', () => {
    setup();
    expect(screen.getByLabelText('From')).toHaveAttribute('placeholder', '1990');
    expect(screen.getByLabelText('To')).toHaveAttribute('placeholder', '2024');
    expect(screen.getByLabelText('From')).toHaveValue(null);
  });

  it('shows the current bounds', () => {
    setup({ yearMin: 2000, yearMax: 2010 });
    expect(screen.getByLabelText('From')).toHaveValue(2000);
    expect(screen.getByLabelText('To')).toHaveValue(2010);
  });

  it('emits a typed bound as a number, per side', () => {
    const { setYearMin, setYearMax } = setup();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2001' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2015' } });
    expect(setYearMin).toHaveBeenCalledWith(2001);
    expect(setYearMax).toHaveBeenCalledWith(2015);
  });

  it('emits undefined when a bound is emptied', () => {
    const { setYearMin } = setup({ yearMin: 2000 });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(setYearMin).toHaveBeenCalledWith(undefined);
  });
});
