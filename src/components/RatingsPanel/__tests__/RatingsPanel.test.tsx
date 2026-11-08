import type { TitleRating } from '@contract/ratings';
import { fireEvent, render, screen } from '@testing-library/react';
import { server } from '@tests/mocks/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingsPanel from '../index';

const ratings: TitleRating[] = [
  { source: 'imdb', label: 'IMDb', value: 8.7, votes: 2100000, scale: 10 },
  { source: 'metacritic', label: 'Metacritic', value: 73, scale: 100 },
];

describe('RatingsPanel', () => {
  const requests: string[] = [];
  const record = ({ request }: { request: Request }) => {
    requests.push(request.url);
  };

  beforeEach(() => {
    requests.length = 0;
    server.events.on('request:start', record);
  });

  afterEach(() => {
    server.events.removeListener('request:start', record);
  });

  it('renders nothing when closed', () => {
    render(
      <RatingsPanel
        isOpen={false}
        onClose={() => {}}
        title="The Matrix"
        year={1999}
        ratings={ratings}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the title it was opened for, with that title’s ratings per source, without a request', async () => {
    render(
      <RatingsPanel
        isOpen={true}
        onClose={() => {}}
        title="The Matrix"
        year={1999}
        ratings={ratings}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Ratings for The Matrix' });
    expect(dialog).toHaveTextContent('1999');
    expect(dialog).toHaveTextContent('IMDb');
    expect(dialog).toHaveTextContent('8.7/10');
    expect(dialog).toHaveTextContent('Metacritic');
    expect(dialog).toHaveTextContent('73/100');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toEqual([]);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <RatingsPanel isOpen={true} onClose={onClose} title="Breaking Bad" year={2008} ratings={[]} />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
