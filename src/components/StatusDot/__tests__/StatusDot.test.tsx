import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusDot from '../index';

describe('StatusDot', () => {
  it('renders a span element for active status', () => {
    const { container } = render(<StatusDot status="active" />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('renders a span element for disabled status', () => {
    const { container } = render(<StatusDot status="disabled" />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
