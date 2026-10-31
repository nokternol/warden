import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@tests/helpers/component';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import MediaPage from '../index.page';

vi.mock('@contract/scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contract/scope')>();
  return {
    ...actual,
    scope: { deferred: { ...actual.scope.deferred, sections: [] } },
  };
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('MediaPage — ratings panel', () => {
  it('opens ratings panel when a movie card is clicked', async () => {
    render(<MediaPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Movie 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('media-card-movie-1'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Movie 1').length).toBeGreaterThan(0);
  });

  it('closes ratings panel when close is clicked', async () => {
    render(<MediaPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Movie 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('media-card-movie-1'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
