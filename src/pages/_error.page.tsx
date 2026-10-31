import type { NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
}

function CustomError({ statusCode }: ErrorProps) {
  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary-text mb-4">{statusCode || 'Error'}</h1>
        <p className="text-xl text-text-muted mb-8">
          {statusCode ? `An error ${statusCode} occurred on server` : 'An error occurred on client'}
        </p>
        <a
          href="/"
          className="inline-block bg-primary hover:bg-primary-hover text-on-primary px-6 py-3 rounded-sm transition-colors duration-150"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

CustomError.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default CustomError;
