import type { TitleRating } from '@contract/ratings';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RatingsDisplay from '../index';

const ratings: TitleRating[] = [
  { source: 'imdb', label: 'IMDb', value: 7.8, votes: 812345, scale: 10 },
  { source: 'rottenTomatoes', label: 'Rotten Tomatoes', value: 88, scale: 100 },
];

describe('RatingsDisplay', () => {
  it('lists each source with its value on its scale, and its vote count when reported', () => {
    render(<RatingsDisplay ratings={ratings} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(within(items[0]).getByText('IMDb')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('7.8/10');
    expect(items[0]).toHaveTextContent('812,345 votes');

    expect(within(items[1]).getByText('Rotten Tomatoes')).toBeInTheDocument();
    expect(items[1]).toHaveTextContent('88/100');
    expect(items[1]).not.toHaveTextContent('votes');
  });
});
