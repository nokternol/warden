import { ImageFader } from '@app/components/ImageFader';
import { PlexIcon, WardenLogo } from '@app/components/Logo';
import { useBackdrops } from '@app/hooks/useBackdrops';
import Head from 'next/head';

/** Why a sign-in attempt did not start a session. */
export interface SignInFailure {
  /** `refused`: the server turned the Plex account away. `failed`: anything else went wrong. */
  kind: 'refused' | 'failed';
  reason: string;
}

const FAILURE_TITLES: Record<SignInFailure['kind'], string> = {
  refused: 'Sign-in refused',
  failed: 'Authentication failed',
};

const REFUSED_HINT =
  'Only the Plex account that first signed in to this Warden can use it. Sign in with that account instead.';

export interface LoginScreenProps {
  isSigningIn: boolean;
  failure: SignInFailure | null;
  onSignIn: () => void;
}

/** The sign-in screen: logo, name, the Plex button, what signing in does, and the last failure. */
export function LoginScreen({ isSigningIn, failure, onSignIn }: LoginScreenProps) {
  const { backdrops } = useBackdrops();

  return (
    <div className="relative min-h-dvh w-full flex flex-col items-center justify-center bg-surface-bg px-6">
      <Head>
        <title>Sign in · Warden</title>
      </Head>
      {/* Backdrops sit under a heavy wash so the sentence on top holds its contrast on any image. */}
      <div className="absolute inset-0 z-0">
        <ImageFader images={backdrops || []} className="opacity-50" />
        <div className="absolute inset-0 bg-surface-bg/80" />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center space-y-6">
        <div className="flex flex-col items-center gap-2">
          <WardenLogo isLoader={isSigningIn} className="w-14 h-14" />
          <h1 className="text-xl font-semibold text-text-primary">Warden</h1>
        </div>

        {failure && (
          <div
            role="alert"
            className="bg-surface-panel border border-danger/40 p-4 rounded-lg text-left"
          >
            <p className="font-semibold text-danger-text text-sm">{FAILURE_TITLES[failure.kind]}</p>
            <p className="text-sm text-text-primary mt-1">{failure.reason}</p>
            {failure.kind === 'refused' && (
              <p className="text-xs text-text-secondary mt-2">{REFUSED_HINT}</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onSignIn}
          disabled={isSigningIn}
          className="w-full bg-plex hover:bg-plex-hover active:bg-plex-active text-on-primary text-sm font-medium min-h-11 py-2 rounded-sm flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PlexIcon className="w-5 h-5" />
          <span>{isSigningIn ? 'Signing in…' : 'Sign in with Plex'}</span>
        </button>

        <p className="text-sm text-text-secondary">
          The first account to sign in becomes this Warden's owner.
        </p>
      </div>
    </div>
  );
}
