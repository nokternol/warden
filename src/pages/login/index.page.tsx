'use client';

import { api } from '@app/lib/api/client';
import { PlexOAuth } from '@app/lib/utils/plexOAuth';
import { ORPCError } from '@orpc/client';
import { useEffect, useState } from 'react';
import { LoginScreen, type SignInFailure } from './LoginScreen';

/** A refusal (403) carries the server's reason; anything else is a generic failure. */
function signInFailure(err: unknown): SignInFailure {
  if (err instanceof ORPCError && err.status === 403) {
    return { kind: 'refused', reason: err.message };
  }
  return { kind: 'failed', reason: err instanceof Error ? err.message : 'Authentication failed' };
}

export default function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | null>(null);

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
    setIsSigningIn(true);
    setFailure(null);

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
      setFailure(signInFailure(err));
    } finally {
      oauth.close();
      setIsSigningIn(false);
    }
  };

  return <LoginScreen isSigningIn={isSigningIn} failure={failure} onSignIn={handlePlexLogin} />;
}
