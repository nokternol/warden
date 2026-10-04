import { ImageFader } from '@app/components/ImageFader';
import { PlexIcon, WardenLogo } from '@app/components/Logo';
import { useBackdrops } from '@app/hooks/useBackdrops';

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

/** The sign-in screen: backdrops, the Plex sign-in button and the last attempt's failure. */
export function LoginScreen({ isSigningIn, failure, onSignIn }: LoginScreenProps) {
  const { backdrops } = useBackdrops();

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
            <WardenLogo isLoader={isSigningIn} className="w-20 h-20" />
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-4xl font-black text-text-primary tracking-tighter mb-2">Warden</h1>
          <p className="text-text-muted text-sm font-medium leading-relaxed max-w-sm mx-auto">
            Rule-based automation for your self-hosted media library
          </p>
        </div>

        {failure && (
          <div
            role="alert"
            className="bg-surface-panel border border-danger/60 p-4 rounded-lg mb-6 shadow-card-elevated"
          >
            <p className="font-semibold text-danger text-sm">{FAILURE_TITLES[failure.kind]}</p>
            <p className="text-sm text-text-primary mt-1">{failure.reason}</p>
            {failure.kind === 'refused' && (
              <p className="text-xs text-text-secondary mt-2">{REFUSED_HINT}</p>
            )}
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
              onClick={onSignIn}
              disabled={isSigningIn}
              className="w-full bg-plex hover:bg-plex-hover active:bg-plex-active text-slate-950 font-bold py-4 rounded-sm flex items-center justify-center gap-3 transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] shadow-lg disabled:opacity-[0.4] disabled:cursor-not-allowed disabled:transform-none"
            >
              <PlexIcon className="w-6 h-6" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in with Plex'}</span>
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
