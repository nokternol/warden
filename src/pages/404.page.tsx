export default function Custom404() {
  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-primary-text mb-4">404</h1>
        <h2 className="text-3xl font-semibold text-text-primary mb-4">Page Not Found</h2>
        <p className="text-text-muted mb-8">The page you are looking for does not exist.</p>
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
