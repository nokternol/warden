import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to catch React component errors and display a fallback UI.
 * Prevents the entire app from crashing when a component throws an error.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface-panel border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-danger-text mb-2">Something went wrong</h2>
            <p className="text-text-secondary text-sm mb-4">An unexpected error occurred.</p>
            <p className="text-text-secondary text-sm mb-4 break-words font-mono">
              {this.state.error.message}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details className="mb-4">
                <summary className="text-sm text-text-muted cursor-pointer hover:text-text-secondary">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 text-xs text-danger-text active bg-surface-bg p-2 rounded overflow-auto max-h-48">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={this.resetError}
              className="w-full bg-primary hover:bg-primary-hover text-on-primary px-4 py-2 rounded transition-colors"
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
