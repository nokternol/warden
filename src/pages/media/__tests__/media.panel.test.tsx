import { contract } from '@contract/index';
import type { ManagedMovie } from '@contract/media';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '@tests/helpers/component';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** One browse page holding `items`. */
function pageOf<T>(items: T[]) {
  return {
    items,
    totalCount: items.length,
    page: 1,
    pageSize: 48,
    yearRange: { min: 1999, max: 1999 },
    errors: [],
    findings: [],
    mediaPage: 'clear' as const,
  };
}

/** Every request the page starts from now on. */
function requestsFromNow(): string[] {
  const urls: string[] = [];
  server.events.on('request:start', ({ request }) => {
    urls.push(request.url);
  });
  return urls;
}

describe('MediaPage — ratings panel', () => {
  afterEach(() => {
    server.events.removeAllListeners('request:start');
  });

  it('shows the clicked movie’s ratings per source, read from its record, without a request', async () => {
    const matrix: ManagedMovie = {
      id: 603,
      title: 'The Matrix',
      year: 1999,
      hasFile: true,
      monitored: true,
      tmdbId: 603,
      sourceCount: 1,
      sourceProviderIds: [1],
      ratings: {
        imdb: { value: 8.7, votes: 2100000, type: 'user' },
        rottenTomatoes: { value: 83, votes: 0, type: 'user' },
      },
    };
    server.use(mockProcedure(contract.media.browse.movie, () => pageOf([matrix])));
    render(<MediaPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('media-card-movie-603')).toBeInTheDocument();
    });
    const requests = requestsFromNow();
    fireEvent.click(screen.getByTestId('media-card-movie-603'));

    const dialog = await screen.findByRole('dialog', { name: 'Ratings for The Matrix' });
    expect(within(dialog).getByText('IMDb')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('8.7/10');
    expect(dialog).toHaveTextContent('2,100,000 votes');
    expect(within(dialog).getByText('Rotten Tomatoes')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('83/100');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toEqual([]);
  });

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

  it('opens the panel from a series card too, once the section has no entry in the declaration', async () => {
    render(<MediaPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('media-card-series-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('media-card-series-1'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
