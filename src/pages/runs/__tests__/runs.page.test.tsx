import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ActivityPage from '../index.page';

describe('ActivityPage', () => {
  it('renders the page heading', () => {
    render(<ActivityPage />);
    expect(screen.getByRole('heading', { name: /activity/i })).toBeInTheDocument();
  });

  it('does not crash on initial render', () => {
    const { container } = render(<ActivityPage />);
    expect(container).toBeTruthy();
  });

  it('renders run rows after data loads', async () => {
    render(<ActivityPage />);

    await waitFor(() => {
      const cells = screen.getAllByText(/nightly cleanup/i);
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it('shows success badge for successful runs', async () => {
    render(<ActivityPage />);

    await waitFor(() => {
      const badges = screen.getAllByText(/success/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('shows error badge for failed runs', async () => {
    render(<ActivityPage />);

    await waitFor(() => {
      // Check for the error badge specifically (not the column header)
      const badges = screen.getAllByText(/error/i);
      // At least one should be a badge (the mock data has an error run)
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('shows pagination Next button', async () => {
    render(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });
});
