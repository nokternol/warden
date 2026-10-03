import AppLayout from '@app/components/AppLayout';
import RatingsDisplay from '@app/components/RatingsDisplay';
import type { AggregatedRatings } from '@app/components/RatingsDisplay';
import RatingsForm from '@app/components/RatingsForm';
import type { RatingsFormValues } from '@app/components/RatingsForm';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useRatings } from '@app/hooks/useRatings';
import { requireAuth } from '@app/lib/utils/requireAuth';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';
import styles from './ratings.module.css';

// ─── Auth guard ───────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RatingsPage() {
  const { trigger, isLoading } = useRatings();
  const [ratings, setRatings] = useState<AggregatedRatings | null>(null);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = async (values: RatingsFormValues) => {
    setError(undefined);
    setRatings(null);

    try {
      const data = await trigger({
        title: values.title,
        year: values.year,
        tmdbApiKey: values.tmdbApiKey || undefined,
        omdbApiKey: values.omdbApiKey || undefined,
      });
      if (data) {
        setRatings(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ratings');
    }
  };

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="Ratings" />}>
      <div className={styles.page}>
        {/* Instructions */}
        <div className={styles.instructions}>
          <h2 className={styles.instructionsTitle}>Ratings Sources</h2>
          <ul className={styles.instructionsList}>
            <li>
              <strong>TVMaze</strong> — always included, no API key required
            </li>
            <li>
              <strong>TMDB</strong> — uses your existing config if API key is left blank
            </li>
            <li>
              <strong>OMDB</strong> — provides IMDb, Rotten Tomatoes &amp; Metacritic scores.{' '}
              <a
                href="https://www.omdbapi.com/apikey.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Get a free key →
              </a>
            </li>
          </ul>
        </div>

        {/* Form */}
        <div className={styles.formPanel}>
          <h3 className={styles.panelTitle}>Fetch Ratings</h3>
          <RatingsForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        {/* Error */}
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}

        {/* Results */}
        {ratings && <RatingsDisplay ratings={ratings} />}
      </div>
    </AppLayout>
  );
}
