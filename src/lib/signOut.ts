import { api } from '@app/lib/api/client';

/** Ends the session and returns to sign-in. */
export async function signOut(): Promise<void> {
  await api.auth.logout();
  window.location.href = '/login';
}
