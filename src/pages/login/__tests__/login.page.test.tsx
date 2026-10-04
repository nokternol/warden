import { contract } from '@contract/index';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/helpers/component';
import { contractPath } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '../index.page';

// The Plex OAuth popup and PIN polling talk to plex.tv; the page only needs the token it yields.
vi.mock('@app/lib/utils/plexOAuth', () => ({
  PlexOAuth: class {
    preparePopup() {}
    login() {
      return Promise.resolve('plex-token');
    }
    close() {}
  },
}));

function answerWithError(
  procedure: Parameters<typeof contractPath>[0],
  status: number,
  type: string,
  message: string
) {
  const { method = 'POST' } = procedure['~orpc'].route;
  const handle = http[method.toLowerCase() as 'get' | 'post'];
  return handle(contractPath(procedure), () =>
    HttpResponse.json({ status: 'error', error: { type, message } }, { status })
  );
}

describe('LoginPage', () => {
  it('tells an account the server refuses that it is not the owner, and why', async () => {
    server.use(
      answerWithError(contract.auth.me, 401, 'UNAUTHORIZED', 'Authentication required'),
      answerWithError(
        contract.auth.plexLogin,
        403,
        'FORBIDDEN',
        'This Warden instance belongs to another Plex account'
      )
    );
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: /sign in with plex/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign-in refused');
    expect(alert).toHaveTextContent('This Warden instance belongs to another Plex account');
  });
});
