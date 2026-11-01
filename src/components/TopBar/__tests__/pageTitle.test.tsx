import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopBar from '../index';

vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="head">{children}</div>
  ),
}));

describe('TopBar page title', () => {
  it('names the document after the page', () => {
    const { getByTestId } = render(<TopBar title="Runs" />);
    expect(getByTestId('head').querySelector('title')).toHaveTextContent('Runs · Warden');
  });
});
