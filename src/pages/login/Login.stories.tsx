import type { Meta, Story, StoryDecorator } from '@ladle/react';
import { LoginScreen } from './LoginScreen';
import LoginPage from './index.page';

export const meta: Meta = {
  // Remove the Provider's min-h-screen wrapper so the login page fills
  // the full Ladle canvas and the backdrop images can be seen properly.
  decorators: [
    ((Component: React.FC) => (
      <div style={{ position: 'fixed', inset: 0 }}>
        <Component />
      </div>
    )) as StoryDecorator,
  ],
};

export const Default: Story = () => <LoginPage />;

/** A Plex account that is not the instance's owner, turned away by the server. */
export const Refused: Story = () => (
  <LoginScreen
    isSigningIn={false}
    failure={{ kind: 'refused', reason: 'This Warden instance belongs to another Plex account' }}
    onSignIn={() => {}}
  />
);

/** A sign-in that failed for any other reason, such as Plex being unreachable. */
export const Failed: Story = () => (
  <LoginScreen
    isSigningIn={false}
    failure={{ kind: 'failed', reason: 'Authentication timeout' }}
    onSignIn={() => {}}
  />
);
