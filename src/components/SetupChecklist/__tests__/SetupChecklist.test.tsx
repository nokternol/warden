import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SetupChecklist from '../index';

describe('SetupChecklist', () => {
  it('explains that no connected provider is a source when providers exist but none is one', () => {
    render(<SetupChecklist state="no-source" />);

    const current = screen.getByRole('listitem', { current: 'step' });
    expect(current).toHaveTextContent('Connect a source');
    expect(current).toHaveTextContent(/none of your providers is a source/i);
  });

  it('marks the source step done, leads with saving a query, and holds back the automation step', () => {
    render(<SetupChecklist state="no-query" />);

    const [source, query, automation] = screen.getAllByRole('listitem');
    expect(source).toHaveTextContent('Connect a source');
    expect(source).toHaveTextContent(/done/i);
    expect(query).toHaveAttribute('aria-current', 'step');
    expect(query).toHaveTextContent('Save a query');
    expect(within(query).getByRole('link', { name: /media/i })).toHaveAttribute('href', '/media');
    expect(automation).toHaveTextContent('Create an automation');
    expect(automation).not.toHaveAttribute('aria-current');
    expect(within(automation).queryByRole('button')).not.toBeInTheDocument();
    expect(within(automation).queryByRole('link')).not.toBeInTheDocument();
  });
});
