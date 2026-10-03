import { api } from '@app/lib/api/client';
import type { SearchResult } from '@contract/media';
import { useState } from 'react';

export type { SearchResult };

export function useMetadataSearch() {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const search = async (title: string) => {
    if (!title.trim()) return;
    setIsLoading(true);
    setError(undefined);
    setResults(null);
    try {
      setResults(await api.media.search({ title }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  return { search, results, isLoading, error };
}
