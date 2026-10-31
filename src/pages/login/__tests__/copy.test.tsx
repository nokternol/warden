import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from '../LoginScreen';

describe('LoginScreen', () => {
  it('says what signing in does, and nothing hollow', () => {
    render(<LoginScreen isSigningIn={false} failure={null} onSignIn={vi.fn()} />);
    expect(
      screen.getByText("The first account to sign in becomes this Warden's owner.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/automation policies/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Warden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with plex/i })).toBeInTheDocument();
  });
});
