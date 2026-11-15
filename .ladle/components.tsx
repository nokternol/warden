import type { GlobalProvider } from '@ladle/react';
import { useEffect, useRef, useState } from 'react';
import '../src/styles/globals.css';
import { worker } from '../tests/mocks/browser';
import { applyStoryMocks } from '../tests/mocks/stories';

// Start the worker once at module level. Storing the promise lets us
// await it inside the Provider without re-starting it on every render.
const mswReady = worker.start({ onUnhandledRequest: 'bypass' });

export const Provider: GlobalProvider = ({ children, globalState, storyMeta }) => {
  const [ready, setReady] = useState(false);
  // null until the first story renders, so the first one always sets the handlers.
  const appliedMocks = useRef<string | undefined | null>(null);
  const isDark = globalState.theme === 'dark';

  useEffect(() => {
    mswReady.then(() => setReady(true));
  }, []);

  // Hold off rendering stories until MSW is intercepting so the first
  // SWR / fetch fired by any story is guaranteed to be handled.
  if (!ready) return null;

  // A story's named mock set (`meta.mocks`, see tests/mocks/stories.ts) is applied before it renders,
  // so its first request is already answered; switching stories puts the shared handlers back.
  const mocks: string | undefined = storyMeta?.mocks;
  if (appliedMocks.current !== mocks) {
    applyStoryMocks(mocks);
    appliedMocks.current = mocks;
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen w-full bg-surface-bg text-text-primary">{children}</div>
    </div>
  );
};
