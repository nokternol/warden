import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppLayout from '../index';

describe('AppLayout skip link', () => {
  it('offers a link that jumps past navigation to the main content', () => {
    render(
      <AppLayout>
        <div>Main Content</div>
      </AppLayout>
    );
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
