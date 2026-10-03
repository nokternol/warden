'use client';

import { ImageFader } from '@app/components/ImageFader';
import { PlexIcon, WardenLogo } from '@app/components/Logo';
import { useBackdrops } from '@app/hooks/useBackdrops';
import { api } from '@app/lib/api/client';
import { PlexOAuth } from '@app/lib/utils/plexOAuth';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { backdrops } = useBackdrops();

  // Redirect already-authenticated users away from the login page
  useEffect(() => {
    api.auth
      .me()
      .then(() => {
        window.location.href = '/dashboard';
      })
      .catch(() => {
        /* not authenticated, stay on login */
      });
  }, []);

  const handlePlexLogin = async () => {
    setIsLoading(true);
    setError(null);

    const oauth = new PlexOAuth();
    // Must run synchronously here (user gesture context) so the browser
    // allows window.open and we get a same-origin proxy we can later close.
    oauth.preparePopup();

    try {
      const authToken = await oauth.login();

      await api.auth.plexLogin({ authToken });

      window.location.href = '/dashboard';
    } catch (err) {
      if (err instanceof Error && err.message === 'Authentication cancelled') return;
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      oauth.close();
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-surface-bg px-6">
      {/* Background with Cinematic Tint */}
      <div className="absolute inset-0 z-0">
        <ImageFader images={backdrops || []} className="opacity-50" />
        {/* Base cinematic wash */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-surface-bg/50 to-surface-bg/90" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        {/* Logo container */}
        <div className="mb-6 flex justify-center">
          <div className="p-4 rounded-lg bg-surface-panel/80 border border-primary/30 shadow-[0_0_30px_rgba(var(--color-primary-glow),0.2)]">
            <WardenLogo isLoader={isLoading} className="w-20 h-20" />
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-4xl font-black text-text-primary tracking-tighter mb-2">Warden</h1>
          <p className="text-text-muted text-sm font-medium leading-relaxed max-w-sm mx-auto">
            Rule-based automation for your self-hosted media library
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-danger/10 border border-danger/50 p-4 rounded-lg mb-6">
            <p className="font-medium text-danger text-sm">Authentication failed</p>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-surface-panel border border-border rounded-lg overflow-hidden shadow-card-elevated">
          <div className="bg-primary/10 py-2 border-b border-border">
            <span className="text-xs font-medium text-primary">Sign in to continue</span>
          </div>

          <div className="p-8">
            <button
              type="button"
              onClick={handlePlexLogin}
              disabled={isLoading}
              className="w-full bg-plex hover:bg-plex-hover active:bg-plex-active text-slate-950 font-bold py-4 rounded-sm flex items-center justify-center gap-3 transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] shadow-lg disabled:opacity-[0.4] disabled:cursor-not-allowed disabled:transform-none"
            >
              <PlexIcon className="w-6 h-6" />
              <span>{isLoading ? 'Signing in...' : 'Sign in with Plex'}</span>
            </button>

            <p className="mt-6 text-xs text-text-muted font-medium">
              By signing in, you agree to your server&apos;s automation policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
