import { contract } from '@contract/index';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@tests/helpers/component';
import { mockProcedureFailure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('LoginPage', () => {
  it('tells an account the server refuses that it is not the owner, and why', async () => {
    server.use(
      mockProcedureFailure(contract.auth.me, 401, {
        type: 'UNAUTHORIZED',
        message: 'Authentication required',
      }),
      mockProcedureFailure(contract.auth.plexLogin, 403, {
        type: 'FORBIDDEN',
        message: 'This Warden instance belongs to another Plex account',
      })
    );
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: /sign in with plex/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign-in refused');
    expect(alert).toHaveTextContent('This Warden instance belongs to another Plex account');
  });

  describe('landing route', () => {
    // Assigning `location.href` would navigate; the spy records the destination instead.
    const navigate = vi.spyOn(Object.getPrototypeOf(window.location), 'href', 'set');

    beforeEach(() => {
      navigate.mockReset().mockImplementation(() => {});
    });

    afterAll(() => {
      navigate.mockRestore();
    });

    it('sends an already signed-in owner to Automations', async () => {
      render(<LoginPage />);

      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/automations'));
    });

    it('lands on Automations after signing in', async () => {
      server.use(
        mockProcedureFailure(contract.auth.me, 401, {
          type: 'UNAUTHORIZED',
          message: 'Authentication required',
        })
      );
      render(<LoginPage />);

      await userEvent.click(screen.getByRole('button', { name: /sign in with plex/i }));

      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/automations'));
    });
  });
});
