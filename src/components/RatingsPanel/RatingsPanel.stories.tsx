import type { TitleRating } from '@contract/ratings';
import type { Story } from '@ladle/react';
import { useState } from 'react';
import RatingsPanel from './index';

const movieRatings: TitleRating[] = [
  { source: 'imdb', label: 'IMDb', value: 8.7, votes: 2100000, scale: 10 },
  { source: 'tmdb', label: 'TMDB', value: 8.2, votes: 26000, scale: 10 },
  { source: 'trakt', label: 'Trakt', value: 8.6, votes: 61000, scale: 10 },
  { source: 'rottenTomatoes', label: 'Rotten Tomatoes', value: 83, votes: 0, scale: 100 },
  { source: 'metacritic', label: 'Metacritic', value: 73, votes: 0, scale: 100 },
];

const seriesRatings: TitleRating[] = [
  { source: 'community', label: 'Community', value: 9.4, votes: 3100, scale: 10 },
];

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function PanelWrapper({
  title,
  year,
  ratings,
  initialOpen = true,
}: {
  title: string;
  year?: number;
  ratings: TitleRating[];
  initialOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <div className="bg-surface-bg min-h-screen relative">
      <div className="p-8">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-primary text-white text-sm rounded-sm"
        >
          Open ratings panel
        </button>
        <p className="mt-2 text-xs text-text-muted font-mono">
          isOpen: {isOpen ? 'true' : 'false'}
        </p>
      </div>

      <RatingsPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        year={year}
        ratings={ratings}
      />
    </div>
  );
}

// ─── Stories ──────────────────────────────────────────────────────────────────

/** A movie: every source its Radarr record reports. */
export const Movie: Story = () => (
  <PanelWrapper title="The Matrix" year={1999} ratings={movieRatings} />
);

/** A series: Sonarr's community rating. */
export const Series: Story = () => (
  <PanelWrapper title="Breaking Bad" year={2008} ratings={seriesRatings} />
);

/** A title its record reports no rating for. */
export const NoRatings: Story = () => <PanelWrapper title="Dune" ratings={[]} />;

export const Closed: Story = () => (
  <PanelWrapper title="The Matrix" year={1999} ratings={movieRatings} initialOpen={false} />
);

export const LongTitle: Story = () => (
  <PanelWrapper
    title="The Lord of the Rings: The Return of the King Extended Edition"
    year={2003}
    ratings={movieRatings}
  />
);
