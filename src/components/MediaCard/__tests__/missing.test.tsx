import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MediaCard from '../index';

describe('MediaCard status', () => {
  it('does not paint Missing in the destructive colour', () => {
    render(<MediaCard.StatusBadge status="missing" />);
    expect(screen.getByText('Missing').className).toMatch(/warning/);
  });
});
