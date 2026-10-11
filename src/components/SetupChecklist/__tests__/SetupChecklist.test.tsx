import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SetupChecklist from '../index';

describe('SetupChecklist', () => {
  it('explains that no connected provider is a source when providers exist but none is one', () => {
    render(<SetupChecklist state="no-source" />);

    const current = screen.getByRole('listitem', { current: 'step' });
    expect(current).toHaveTextContent('Connect a source');
    expect(current).toHaveTextContent(/none of your providers is a source/i);
  });
});
