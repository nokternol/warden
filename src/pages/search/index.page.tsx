import AppLayout from '@app/components/AppLayout';
import SidebarNav from '@app/components/SidebarNav';
import TopBar from '@app/components/TopBar';
import { useMetadataSearch } from '@app/hooks/useMetadataSearch';
import type { SearchResult } from '@app/hooks/useMetadataSearch';
import { requireAuth } from '@app/lib/utils/requireAuth';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';

// ─── Result Section ───────────────────────────────────────────────────────────

function ResultSection({ result }: { result: SearchResult }) {
  const [open, setOpen] = useState(false);

  const statusColor =
    result.status === 'ok'
      ? 'bg-green-500/20 text-green-400'
      : result.status === 'error'
        ? 'bg-red-500/20 text-red-400'
        : 'bg-gray-500/20 text-gray-400';

  return (
    <div className="border border-border rounded-lg bg-surface-panel overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-bg transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-text-primary">{result.name}</span>
          <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">
            {result.type}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColor}`}>{result.status}</span>
        </div>
        <svg
          className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border">
          {result.status === 'error' && <p className="mt-3 text-sm text-red-400">{result.error}</p>}
          {result.status === 'unavailable' && (
            <p className="mt-3 text-sm text-text-secondary">Provider type not searchable.</p>
          )}
          {result.status === 'ok' && (
            <pre className="mt-3 text-xs text-text-secondary overflow-auto max-h-96 whitespace-pre-wrap break-words">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRedirect = await requireAuth(ctx);
  if (authRedirect) return authRedirect;
  return { props: {} };
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const { search, results, isLoading, error } = useMetadataSearch();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  return (
    <AppLayout sidebar={<SidebarNav />} topBar={<TopBar title="Metadata Search" />}>
      <div className="p-6 space-y-6">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title across providers…"
            className="flex-1 px-4 py-2 bg-surface-bg border border-border rounded text-text-primary placeholder-text-secondary"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-primary text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <div
            className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {results !== null && results.length === 0 && (
          <p className="text-text-secondary text-center py-8">No configured providers to search.</p>
        )}

        {results !== null && results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <ResultSection key={r.providerId} result={r} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
